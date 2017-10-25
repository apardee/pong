package main

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

type matchPending struct {
	host bool
	mid string
	conn *websocket.Conn
}

type matchMaker struct {
	connInput          chan *matchPending
	matchesPendingLock sync.Mutex
	matchesPending     map[string]*websocket.Conn
}

func newMatchMaker() *matchMaker {
	return &matchMaker{
		connInput:          make(chan *matchPending),
		matchesPendingLock: sync.Mutex{},
		matchesPending:     make(map[string]*websocket.Conn),
	}
}

type match struct {
	host   *websocket.Conn
	client *websocket.Conn
}

var mm *matchMaker

func startMatch(m *match) {
	log.Println("Starting a match...")

	// For the time being, we keep the connection open and await a pair.
	ctx := context.Background()
	ctx, cancel := context.WithCancel(ctx)

	chanReader := func(conn *websocket.Conn, out chan<- []byte, dump bool) {
		finished := false
		for !finished {
			select {
			case <-ctx.Done():
				finished = true
				cancel()
				break
			default:
				_, byt, err := conn.ReadMessage()
				if err != nil {
					cancel()
				} else {
					out <- byt
				}
			}
		}
	}

	hostRead := make(chan []byte)
	clientRead := make(chan []byte)

	go chanReader(m.host, hostRead, false)
	go chanReader(m.client, clientRead, true)

	// Kick off the match by sending the `MatchStart` message through both connections.
	m.host.WriteMessage(websocket.TextMessage, []byte("{ \"type\": \"MatchStart\", \"payload\": { \"role\": \"Host\" } }"))
	m.client.WriteMessage(websocket.TextMessage, []byte("{ \"type\": \"MatchStart\", \"payload\": { \"role\": \"Client\" } }"))

	// Once started, just relay messages between the two.
	finished := false
	for !finished {
		select {
		case <-ctx.Done():
			finished = true
			break
		case byt := <-hostRead:
			if err := m.client.WriteMessage(websocket.TextMessage, byt); err != nil {
				cancel()
			}
		case byt := <-clientRead:
			if err := m.host.WriteMessage(websocket.TextMessage, byt); err != nil {
				cancel()
			}
		}
	}
}

func makeMatches(mm *matchMaker) {
	// Host connections wait around here...
	// TODO: Keep-alive for all websocket connections.
	for {
		log.Println("Got a pending match...")
		pending := <-mm.connInput
		if pending.host {
			var mid string
			mm.matchesPendingLock.Lock()
			for {
				mid = fmt.Sprintf("%04d", rand.Intn(1000))
				_, ok := mm.matchesPending[mid]
				if !ok {
					break
				}
			}
			mm.matchesPending[mid] = pending.conn
			mm.matchesPendingLock.Unlock()

			message := fmt.Sprintf("{ \"type\": \"MatchId\", \"payload\": { \"mid\": \"%s\" } }", mid)
			pending.conn.WriteMessage(websocket.TextMessage, []byte(message))
		} else {
			mm.matchesPendingLock.Lock()
			hostConn := mm.matchesPending[pending.mid]
			delete(mm.matchesPending, pending.mid)
			mm.matchesPendingLock.Unlock()

			if hostConn != nil {
				m := match{host: hostConn, client: pending.conn}
				go startMatch(&m)
			} else {
				// TODO: Write an error back into the client socket.
			}
		}
	}
}

func receiveConnection(w http.ResponseWriter, r *http.Request) {
	log.Println("Received a request...")

	var mid string
	mids := r.URL.Query()["mid"]
	if len(mids) > 0 {
		mid = mids[0]
		mm.matchesPendingLock.Lock()
		_, ok := mm.matchesPending[mid]
		if !ok {
			log.Println("no match found :(")
		}
		mm.matchesPendingLock.Unlock()

		if !ok {
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte("404 - Match does not exist"))
			return
		}
	}

	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Print(err)
	} else {
		log.Println("Upgraded a request...")
		pending := &matchPending{host: mid == "", mid: mid, conn: conn}
		mm.connInput <- pending
	}
}

// Test Logic
func runWithConnection(conn *websocket.Conn) {
	for {
		_, bytes, err := conn.ReadMessage()
		if err == nil {
			if bytes != nil {
				log.Println(string(bytes))
			}
		} else {
			log.Println(err)
		}
	}
}

func runConnection() {
	conn, resp, err := websocket.DefaultDialer.Dial("ws://localhost:8080", nil)
	log.Println("Client connected...", resp)
	if err != nil {
		log.Fatal(err)
	}
	for {
		// log.Println("Sending a message...")
		if err := conn.WriteMessage(websocket.TextMessage, []byte("Test...")); err != nil {
			log.Fatal("Failed to write message...", err)
			break
		}
	}
}

func main() {
	mm = newMatchMaker()
	// go runConnection()
	go makeMatches(mm)
	http.HandleFunc("/", receiveConnection)
	http.ListenAndServe(":8080", nil)
}

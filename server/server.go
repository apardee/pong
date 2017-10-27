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

type matchRequest struct {
	host bool
	mid  string
	conn *websocket.Conn
}

type matchMaker struct {
	connInput        chan *matchRequest
	matchRequestLock sync.Mutex
	matchRequests    map[string]*match
}

func newMatchMaker() *matchMaker {
	return &matchMaker{
		connInput:        make(chan *matchRequest),
		matchRequestLock: sync.Mutex{},
		matchRequests:    make(map[string]*match),
	}
}

type match struct {
	hostConn   *websocket.Conn
	mid        string
	clientChan chan *websocket.Conn
}

var mm *matchMaker

func runMatch(m *match) {
	log.Println("Running a match...")

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

	defer m.hostConn.Close()
	var client *websocket.Conn

	matchIDMessage := fmt.Sprintf("{ \"type\": \"MatchId\", \"payload\": { \"mid\": \"%s\" } }", m.mid)
	if err := m.hostConn.WriteMessage(websocket.TextMessage, []byte(matchIDMessage)); err != nil {
		cancel()
		return
	}

	// For now, the host waits for the client.
	hostRead := make(chan []byte)
	go chanReader(m.hostConn, hostRead, false)
	for client == nil {
		select {
		case <-ctx.Done():
			cancel()
			log.Println("Failed. Finished match...")
			return
		case <-hostRead:
			break
		case client = <-m.clientChan:
			break
		}
	}

	log.Println("Client found, starting match...")

	// Kick off the match by sending the `MatchStart` message through both connections.
	hostStart := "{ \"type\": \"MatchStart\", \"payload\": { \"role\": \"Host\" } }"
	clientStart := "{ \"type\": \"MatchStart\", \"payload\": { \"role\": \"Client\" } }"
	if err := m.hostConn.WriteMessage(websocket.TextMessage, []byte(hostStart)); err != nil {
		cancel()
	}
	if err := client.WriteMessage(websocket.TextMessage, []byte(clientStart)); err != nil {
		cancel()
	}

	clientRead := make(chan []byte)
	go chanReader(client, clientRead, true)

	// Once started, just relay messages between the two.
	finished := false
	for !finished {
		select {
		case <-ctx.Done():
			finished = true
			break
		case byt := <-hostRead:
			if err := client.WriteMessage(websocket.TextMessage, byt); err != nil {
				cancel()
			}
		case byt := <-clientRead:
			if err := m.hostConn.WriteMessage(websocket.TextMessage, byt); err != nil {
				cancel()
			}
		}
	}
	log.Println("Match complete...")
}

func serveMatchRequests(mm *matchMaker) {
	// Host connections wait around here...
	for {
		request := <-mm.connInput
		if request.host {
			// Do the whole mid generation
			var mid string
			mm.matchRequestLock.Lock()
			for {
				mid = fmt.Sprintf("%04d", rand.Intn(1000))
				_, ok := mm.matchRequests[mid]
				if !ok {
					break
				}
			}
			m := match{hostConn: request.conn, mid: mid, clientChan: make(chan *websocket.Conn)}
			mm.matchRequests[mid] = &m
			mm.matchRequestLock.Unlock()
			go runMatch(&m)
		} else {
			mm.matchRequestLock.Lock()
			m, ok := mm.matchRequests[request.mid]
			if ok {
				delete(mm.matchRequests, request.mid)
			}
			mm.matchRequestLock.Unlock()
			if ok {
				m.clientChan <- request.conn
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
		mm.matchRequestLock.Lock()
		_, ok := mm.matchRequests[mid]
		if !ok {
			log.Println("no match found :(")
		}
		mm.matchRequestLock.Unlock()

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
		request := &matchRequest{host: mid == "", mid: mid, conn: conn}
		mm.connInput <- request
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
	go serveMatchRequests(mm)
	http.HandleFunc("/", receiveConnection)
	http.ListenAndServe(":8080", nil)
}

package main

import (
	"context"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

type matchMaker struct {
	connInput          chan *websocket.Conn
	matchesPendingLock sync.Mutex
	matchesPending     map[string]*websocket.Conn
}

func newMatchMaker() *matchMaker {
	return &matchMaker{
		connInput:          make(chan *websocket.Conn),
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
	var pending *websocket.Conn
	for {
		conn := <-mm.connInput
		log.Println("received connection")
		if pending == nil {
			log.Println("received connection")
			pending = conn
		} else {
			log.Println("received connection")
			m := match{host: pending, client: conn}
			go startMatch(&m)
			pending = nil
		}
	}
}

func receiveConnection(w http.ResponseWriter, r *http.Request) {
	log.Println("Received a request...")

	// TODO: use the match id to set up the connection with the awaiting player.
	// If there *isn't* a valid match, forget about it.
	mid := r.URL.Query()["mid"]
	log.Println(mid)

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
		mm.connInput <- conn
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

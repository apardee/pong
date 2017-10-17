package main

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

type matchMaker struct {
	connInput chan *websocket.Conn
}

type match struct {
	host   *websocket.Conn
	client *websocket.Conn
}

func startMatch(m *match) {
	log.Println("Starting a match...")

	finished := false
	chanReader := func(conn *websocket.Conn, out chan<- []byte) {
		for !finished {
			_, byt, err := conn.ReadMessage()
			if err != nil {
				finished = true
			} else {
				out <- byt
			}
		}
	}

	hostRead := make(chan []byte)
	clientRead := make(chan []byte)

	go chanReader(m.host, hostRead)
	go chanReader(m.client, clientRead)

	// Kick off the match by sending the `MatchStart` message through both connections.
	m.host.WriteMessage(websocket.TextMessage, []byte("{ \"type\": \"MatchStart\", \"payload\": { \"role\": \"Host\" } }"))
	m.client.WriteMessage(websocket.TextMessage, []byte("{ \"type\": \"MatchStart\", \"payload\": { \"role\": \"Client\" } }"))

	// Once started, just relay messages between the two.
	for !finished {
		select {
		case byt := <-hostRead:
			if err := m.client.WriteMessage(websocket.TextMessage, byt); err != nil {
				finished = true
			}
		case byt := <-clientRead:
			if err := m.host.WriteMessage(websocket.TextMessage, byt); err != nil {
				finished = true
			}
		}
	}
}

func makeMatches(mm *matchMaker) {
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

var mm matchMaker

func receiveConnection(w http.ResponseWriter, r *http.Request) {
	log.Println("Received a request...")
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
	mm = matchMaker{connInput: make(chan *websocket.Conn)}
	// go runConnection()
	go makeMatches(&mm)
	http.HandleFunc("/", receiveConnection)
	http.ListenAndServe(":8080", nil)
}

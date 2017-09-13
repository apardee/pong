package main

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

func runWithConnection(conn *websocket.Conn) {
	for {
		// log.Println("Reading a message...")
		_, bytes, err := conn.ReadMessage()
		if err == nil {
			log.Println(string(bytes))
		}
	}
}

func receiveSocket(w http.ResponseWriter, r *http.Request) {
	log.Println("Received a request...")
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, err.Error(), 500)
	}

	log.Println("Upgraded a request...")
	runWithConnection(conn)
}

func runConnection() {
	conn, resp, err := websocket.DefaultDialer.Dial("ws://localhost:8080", nil)
	log.Println("Client connected...", resp)
	if err != nil {
		log.Fatal(err)
	}
	for {
		// log.Println("Sending a message...")
		if err := conn.WriteMessage(websocket.BinaryMessage, []byte("Test...")); err != nil {
			log.Fatal("Failed to write message...", err)
			break
		}
	}
}

func main() {
	go runConnection()
	http.HandleFunc("/", receiveSocket)
	http.ListenAndServe(":8080", nil)
}

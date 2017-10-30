package main

import (
	"log"
	"time"

	"github.com/gorilla/websocket"
)

func runHost() {
	conn, _, err := websocket.DefaultDialer.Dial("ws://127.0.0.1:8080", nil)
	if err != nil {
		log.Fatal("Couldn't connect to host")
	}

	_, byt, err := conn.ReadMessage()
	if err != nil {
		log.Fatal("Failed to read first message from host connection...")
	}

	log.Println("Received:", string(byt))

	for {
		time.Sleep(time.Second * 3)
	}
}

// func runClient(mid) {
// 	websocket.DefaultDialer.Dial
// }

func main() {
	log.Println("Running test client...")
	runHost()
}

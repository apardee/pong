package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

func run(c *websocket.Conn) {
	log.Println("Running connection...")
	for {
		log.Println("reading the next message...")
		_, byt, err := c.ReadMessage()
		log.Printf("message length: %d\n", len(byt))
		if err != nil {
			log.Println("failed to read message, aborting connection...")
			break
		}
		log.Println("relaying message back...")
		if err := c.WriteMessage(websocket.BinaryMessage, byt); err != nil {
			log.Println("failed to relay message, aborting connection...")
			break
		}
	}
	c.Close()
}

func sock(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Fatal("couldn't upgrade")
	}
	go run(conn)
}

func main() {
	fmt.Println("Starting test server...")

	http.HandleFunc("/", sock)
	http.ListenAndServe(":8888", nil)
}

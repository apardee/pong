package main

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

func run(c *websocket.Conn) {
	log.Println("Running connection...")
	done := false
	for !done {
		select {
		case <-time.After(1 * time.Second):
			log.Println("Sending test message...")
			if err := c.WriteMessage(websocket.BinaryMessage, []byte("test!")); err != nil {
				done = true
			}
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

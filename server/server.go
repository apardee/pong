package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"strconv"
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

type matchIDMessage struct {
	MessageType uint8
	Mid         uint32
}

type matchStartMessage struct {
	MessageType uint8
	Role        uint8
}

var mm *matchMaker

func runMatch(m *match) {
	log.Println("Running a match...")

	// For the time being, we keep the connection open and await a pair.
	ctx := context.Background()
	ctx, cancel := context.WithCancel(ctx)

	chanReader := func(conn *websocket.Conn, out chan<- []byte) {
		finished := false
		for !finished {
			select {
			case <-ctx.Done():
				finished = true
			default:
				_, byt, err := conn.ReadMessage()
				if err != nil {
					finished = true
				} else {
					// Relay the bytes read along as unless the operation has already been cancelled
					select {
					case <-ctx.Done():
						break
					default:
						out <- byt
					}
				}
			}
		}

		close(out)
		conn.Close()
		cancel()
	}

	defer m.hostConn.Close()
	var client *websocket.Conn

	mid, err := strconv.Atoi(m.mid)
	if err != nil {
		log.Printf("Failed to convert the match id, match failed...")
		cancel()
		return
	}

	{
		buf := &bytes.Buffer{}
		binary.Write(buf, binary.BigEndian, matchIDMessage{1, uint32(mid)}) // TODO: make that message type a constant
		if err := m.hostConn.WriteMessage(websocket.BinaryMessage, buf.Bytes()); err != nil {
			log.Printf("Failed to write the match id message...")
			cancel()
			return
		}
	}

	// For now, the host waits for the client.
	hostRead := make(chan []byte)
	go chanReader(m.hostConn, hostRead)
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
	{
		buf := &bytes.Buffer{}
		binary.Write(buf, binary.BigEndian, matchStartMessage{2, 1})
		if err := m.hostConn.WriteMessage(websocket.BinaryMessage, buf.Bytes()); err != nil {
			cancel()
		}
	}

	{
		buf := &bytes.Buffer{}
		binary.Write(buf, binary.BigEndian, matchStartMessage{2, 2})
		if err := client.WriteMessage(websocket.BinaryMessage, buf.Bytes()); err != nil {
			cancel()
		}
	}

	clientRead := make(chan []byte)
	go chanReader(client, clientRead)

	// Once started, just relay messages between the two.
	finished := false
	for !finished {
		select {
		case <-ctx.Done():
			finished = true
			break
		case byt := <-hostRead:
			if err := client.WriteMessage(websocket.BinaryMessage, byt); err != nil {
				cancel()
			}
		case byt := <-clientRead:
			if err := m.hostConn.WriteMessage(websocket.BinaryMessage, byt); err != nil {
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

func main() {
	mm = newMatchMaker()
	go serveMatchRequests(mm)
	http.HandleFunc("/sock", receiveConnection)
	http.Handle("/", http.FileServer(http.Dir("./client")))
	http.ListenAndServe(":8080", nil)
}

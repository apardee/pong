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

const maxMatches = 32
const matchIDMessageId = 1
const matchStartMessageId = 2

type matchRequest struct {
	host bool
	mid  string
	conn *websocket.Conn
}

type matchCounter struct {
	*sync.Mutex
	count int
}

func newMatchCounter() *matchCounter {
	return &matchCounter{
		Mutex: &sync.Mutex{},
		count: 0,
	}
}

func (m *matchCounter) activeCount() int {
	m.Lock()
	defer m.Unlock()
	return m.count
}

func (m *matchCounter) increment() {
	m.Lock()
	defer m.Unlock()
	m.count = m.count + 1
}

func (m *matchCounter) decrement() {
	m.Lock()
	defer m.Unlock()
	m.count = m.count - 1
}

type matchMaker struct {
	connInput        chan *matchRequest
	matchRequestLock sync.Mutex
	matchRequests    map[string]*match
	counter          *matchCounter
}

func newMatchMaker() *matchMaker {
	return &matchMaker{
		connInput:        make(chan *matchRequest),
		matchRequestLock: sync.Mutex{},
		matchRequests:    make(map[string]*match),
		counter:          newMatchCounter(),
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

// runMatch handles the lifecycle of a hosted match, from client-pending through
// match completion.
func runMatch(m *match, counter *matchCounter) {
	counter.increment()

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
		log.Printf("Match aborted (%04d): failed to convert the match id, match failed\n", mid)
		counter.decrement()
		cancel()
		return
	}

	log.Printf("Starting match %04d\n", mid)
	{
		buf := &bytes.Buffer{}
		binary.Write(buf, binary.BigEndian, matchIDMessage{matchIDMessageId, uint32(mid)})
		if err := m.hostConn.WriteMessage(websocket.BinaryMessage, buf.Bytes()); err != nil {
			log.Printf("Match aborted (%04d): failed to write the match id message\n", mid)
			counter.decrement()
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
			log.Printf("Match aborted (%04d): cancelled while awaiting client\n", mid)
			counter.decrement()
			cancel()
			return
		case <-hostRead:
			break
		case client = <-m.clientChan:
			break
		}
	}

	// Kick off the match by sending the `MatchStart` message through both connections.
	log.Printf("Client found, starting match %04d...\n", mid)
	{
		buf := &bytes.Buffer{}
		binary.Write(buf, binary.BigEndian, matchStartMessage{matchStartMessageId, 1})
		if err := m.hostConn.WriteMessage(websocket.BinaryMessage, buf.Bytes()); err != nil {
			cancel()
		}
	}

	{
		buf := &bytes.Buffer{}
		binary.Write(buf, binary.BigEndian, matchStartMessage{matchStartMessageId, 2})
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

	counter.decrement()
	log.Printf("Match completed (%04d), %d remaining\n", mid, counter.activeCount())
}

// serveMatchRequests receives websocket + match request info, pairs up host and client,
// and runs the match via-runMatch.
func serveMatchRequests(mm *matchMaker) {
	// Host connections wait around here...
	for {
		request := <-mm.connInput
		if request.host {
			// Do the whole mid generation
			var mid string
			mm.matchRequestLock.Lock()
			for {
				mid = fmt.Sprintf("%04d", rand.Intn(10000))
				_, ok := mm.matchRequests[mid]
				if !ok {
					break
				}
			}
			m := match{hostConn: request.conn, mid: mid, clientChan: make(chan *websocket.Conn)}
			mm.matchRequests[mid] = &m
			mm.matchRequestLock.Unlock()
			go runMatch(&m, mm.counter)
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
				request.conn.Close()
			}
		}
	}
}

// receiveConnection handles incoming websocket connection requests, upgrading the connection
// and passing them off to the connection input channel for further processing.
func receiveConnection(w http.ResponseWriter, r *http.Request) {
	log.Println("Handling match request")
	var mid string
	mids := r.URL.Query()["mid"]
	if len(mids) > 0 {
		mid = mids[0]
		mm.matchRequestLock.Lock()
		_, ok := mm.matchRequests[mid]
		mm.matchRequestLock.Unlock()
		if !ok {
			errString := "404 - No match found with the id requested"
			http.Error(w, errString, http.StatusNotFound)
			log.Println(errString)
			return
		}
	} else {
		// Enforce a limit on the number of active & pending matches.
		count := mm.counter.activeCount()
		if count >= maxMatches {
			errString := "503 - Too many active matches. Try again soon."
			http.Error(w, errString, http.StatusServiceUnavailable)
			log.Println(errString)
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

	log.Println("Upgrading websocket connection")
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Print(err)
	} else {
		log.Println("Successfully upgraded the request")
		request := &matchRequest{host: mid == "", mid: mid, conn: conn}
		mm.connInput <- request
	}
}

func main() {
	log.Println("Pong server starting up and serving matches...")
	mm = newMatchMaker()

	// Kick off the connection handling runloop.
	go serveMatchRequests(mm)

	// Serve websocket connection & match handling.
	http.HandleFunc("/sock", receiveConnection)

	// Serve the state resources along with match handling.
	http.Handle("/", http.FileServer(http.Dir("./client")))

	http.ListenAndServe(":8080", nil)
}

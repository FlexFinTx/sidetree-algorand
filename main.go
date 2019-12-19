package main

import (
	"fmt"

	"github.com/algorand/go-algorand-sdk/client/algod"
)

// These constants represent the algod REST endpoint and the corresponding
// API token. You can retrieve these from the `algod.net` and `algod.token`
// files in the algod data directory.
const algodAddress = "https://testnet-algorand.api.purestake.io/ps1"

func main() {
	var headers []*algod.Header
	tokenHeader := &algod.Header{
		Key:   "X-API-Key",
		Value: "BRPTQsPHTj2fzEwZpnnap9YA0fk9w39340w4xYx3",
	}
	headers = append(headers, tokenHeader)
	// Create an algod client
	algodClient, err := algod.MakeClientWithHeaders(algodAddress, "", headers)
	if err != nil {
		fmt.Printf("failed to make algod client: %s\n", err)
		return
	}

	// Print algod status
	nodeStatus, err := algodClient.Status()
	if err != nil {
		fmt.Printf("error getting algod status: %s\n", err)
		return
	}

	fmt.Printf("algod last round: %d\n", nodeStatus.LastRound)
	fmt.Printf("algod time since last round: %d\n", nodeStatus.TimeSinceLastRound)
	fmt.Printf("algod catchup: %d\n", nodeStatus.CatchupTime)
	fmt.Printf("algod latest version: %s\n", nodeStatus.LastVersion)

	// Fetch block information
	lastBlock, err := algodClient.Block(2729005)
	if err != nil {
		fmt.Printf("error getting last block: %s\n", err)
		return
	}

	for _, tx := range lastBlock.Transactions.Transactions {
		fmt.Println(string(tx.Note))
	}

}

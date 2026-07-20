package sav

import (
	"fmt"
	"os"
)

// ContainerFormat is the stable, non-sensitive save container identity.
type ContainerFormat struct {
	Magic    string
	SaveType byte
}

// InspectContainer reads only the bounded container prefix.
func InspectContainer(path string) (ContainerFormat, error) {
	file, err := os.Open(path)
	if err != nil {
		return ContainerFormat{}, fmt.Errorf("sav: open container header")
	}
	defer file.Close()
	prefix := make([]byte, 24)
	n, err := file.Read(prefix)
	if err != nil && n == 0 {
		return ContainerFormat{}, fmt.Errorf("sav: read container header")
	}
	header, err := parseContainerHeader(prefix[:n])
	if err != nil {
		return ContainerFormat{}, err
	}
	return ContainerFormat{Magic: header.Magic, SaveType: header.SaveType}, nil
}

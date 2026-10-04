// Package vectors reads the JSON test vectors in spec/testvectors, which Go and Kotlin both load.
package vectors

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
)

// Vector is one shared test case. Fields ending in _hex hold lowercase hex bytes.
type Vector struct {
	Name          string         `json:"name"`
	Source        string         `json:"source"`
	Input         map[string]any `json:"input"`
	Intermediates map[string]any `json:"intermediates"`
	Output        map[string]any `json:"output"`
	Expect        string         `json:"expect"`
	Diagnostic    string         `json:"diagnostic"`
}

// LoadRaw returns the file bytes, for tests that compare a committed vector with its generator.
func LoadRaw(path string) ([]byte, error) {
	return os.ReadFile(path) //nolint:gosec // the caller names the vector file
}

func Load(path string) (Vector, error) {
	raw, err := LoadRaw(path)
	if err != nil {
		return Vector{}, err
	}
	var v Vector
	if err := json.Unmarshal(raw, &v); err != nil {
		return Vector{}, fmt.Errorf("%s: %w", path, err)
	}
	return v, nil
}

// Bytes decodes the hex field key from the named section ("input", "intermediates" or "output").
func (v Vector) Bytes(section, key string) ([]byte, error) {
	var fields map[string]any
	switch section {
	case "input":
		fields = v.Input
	case "intermediates":
		fields = v.Intermediates
	case "output":
		fields = v.Output
	default:
		return nil, fmt.Errorf("unknown section %q", section)
	}
	raw, ok := fields[key]
	if !ok {
		return nil, fmt.Errorf("%s.%s: field not present", section, key)
	}
	s, ok := raw.(string)
	if !ok {
		return nil, fmt.Errorf("%s.%s: want a hex string, got %T", section, key, raw)
	}
	b, err := hex.DecodeString(s)
	if err != nil {
		return nil, fmt.Errorf("%s.%s: %w", section, key, err)
	}
	return b, nil
}

// Command vectors loads the shared test vectors in spec/testvectors. The -update flag regenerates
// the vectors that Go produces; vectors taken from an RFC are hand-written and never regenerated.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol/vectors"
)

// generators maps a vector path under the spec directory to the function that produces it.
var generators = map[string]func() (vectors.Vector, error){
	"skeleton/request-1.json": vectors.SkeletonRequest,
}

func main() {
	dir := flag.String("dir", "spec/testvectors", "directory holding the vectors")
	update := flag.Bool("update", false, "rewrite the generated vectors")
	flag.Parse()

	if *update {
		for rel, gen := range generators {
			if err := write(filepath.Join(*dir, rel), gen); err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			fmt.Println("wrote", filepath.Join(*dir, rel))
		}
		return
	}

	paths, err := filepath.Glob(filepath.Join(*dir, "*", "*.json"))
	if err != nil || len(paths) == 0 {
		fmt.Fprintf(os.Stderr, "no vectors found under %s\n", *dir)
		os.Exit(1)
	}
	failed := false
	for _, p := range paths {
		if _, err := vectors.Load(p); err != nil {
			fmt.Fprintln(os.Stderr, err)
			failed = true
			continue
		}
		fmt.Println("ok  ", p)
	}
	if failed {
		os.Exit(1)
	}
}

func write(path string, gen func() (vectors.Vector, error)) error {
	v, err := gen()
	if err != nil {
		return err
	}
	b, err := v.JSON()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644) //nolint:gosec // vectors are public files
}

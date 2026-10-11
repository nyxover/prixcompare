#!/bin/sh
python3 -m http.server --directory $(dirname "$0") 9000

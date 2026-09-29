#!/usr/bin/env bash
# supervise-master.sh — backward-compatible wrapper (CPT-554).
# Delegates to the generalized supervise.sh.
exec "$(dirname "$0")/supervise.sh" master

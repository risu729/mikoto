# @mikoto/bridge

Local bridge process.

## Local Development

From the repository root:

```console
cp mikoto.example.toml mikoto.toml
mise //packages/bridge:run
```

The default local relay URL in `mikoto.example.toml` is
`ws://localhost:8787/bridge`. Override it with `MIKOTO_RELAY_URL` when targeting
a deployed relay.

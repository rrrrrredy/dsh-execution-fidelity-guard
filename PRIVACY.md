# Privacy

The plugin reads one bounded contract file and the current public tool/lifecycle events supplied by DeepSeek Harness. It does not read hidden chain-of-thought or upload data.

Receipt persistence is off by default. When enabled, receipts contain hashes and decision metadata, not raw tool arguments or full tool output. The Host and tools may have separate logging policies outside this plugin.


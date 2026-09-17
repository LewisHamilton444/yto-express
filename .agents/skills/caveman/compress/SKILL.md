---
name: caveman-compress
description: >-
  Compresses verbose logs, stack traces, compiler output, or prompt text into
  dense, high-signal technical tokens.
---

# Caveman Context Compressor

Take raw text/logs. Strip noise, preserve causality, line references, and exact error messages.

## Compression Rules

1. Drop timestamps, routine info lines, and heartbeat pings unless directly relevant to failure.
2. Isolate root exception, failing thread, file path, and line number.
3. Replace verbose explanations with causality arrow: `Cause -> Effect -> Failure`.
4. Output structured digest.

## Example

Input:
`2026-09-14 10:12:01.123 [main] ERROR com.example.app.AuthService - User authentication failed. java.lang.NullPointerException: Attempt to invoke virtual method 'java.lang.String com.example.app.User.getToken()' on a null object reference at com.example.app.AuthService.validate(AuthService.java:42)`

Output:
`AuthService.java:42: NPE on User.getToken() (User object null) -> validate() fail.`

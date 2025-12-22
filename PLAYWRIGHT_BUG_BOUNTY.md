# Playwright MCP HTTP Server - Bug Bounty & Community Help Request

**Date**: December 22, 2024  
**Status**: Seeking Community Help  
**Priority**: Critical - Browser Operations Completely Blocked  
**Reward**: Community Recognition + Credit in Project

---

## 🎯 What We're Building

We're building an HTTP server wrapper for the Playwright MCP (Model Context Protocol) server that enables browser automation in serverless environments (specifically Google Cloud Run).

**GitHub Repository**: [mcpmessenger/playwright-mcp](https://github.com/mcpmessenger/playwright-mcp)

**Live Service**: https://playwright-mcp-http-server-554655392699.us-central1.run.app

---

## 🏗️ Architecture Overview

```
Client Request (JSON-RPC)
    ↓
HTTP Server (Express.js) ← We built this
    ↓
Forward JSON-RPC via STDIO
    ↓
@playwright/mcp Package ← External dependency
    ↓
Playwright Browser Operations
```

**Our HTTP Server**:
- Accepts HTTP POST requests with JSON-RPC 2.0 format
- Spawns `@playwright/mcp` as a child process via `npx`
- Communicates via STDIO (stdin/stdout)
- Forwards all requests transparently

---

## ❌ Critical Issues

We're experiencing **two critical issues** that are blocking all browser operations:

### Issue 1: URL Parameter Not Extracted

**Error**: `SyntaxError: browserType.launch: Invalid URL: undefined`

**What We Send**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "browser_navigate",
    "arguments": {
      "url": "https://google.com"
    }
  }
}
```

**What Happens**:
- ✅ Our server receives the request
- ✅ Our server forwards it to `@playwright/mcp` correctly
- ❌ `@playwright/mcp` receives `undefined` for the URL
- ❌ Browser launch fails

**Question**: Is `params.arguments.url` the correct way to pass the URL? Or should it be structured differently?

---

### Issue 2: Browser Launch Arguments Not Applied

**Error**: `Running as root without --no-sandbox is not supported. See https://crbug.com/638180.`

**What We've Done**:
1. Set environment variable: `PLAYWRIGHT_BROWSER_ARGS=--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu`
2. Pass it to spawned process:
```typescript
const env: NodeJS.ProcessEnv = {
  ...process.env,
  PLAYWRIGHT_BROWSER_ARGS: process.env.PLAYWRIGHT_BROWSER_ARGS,
};
const proc = spawn("npx", ["-y", "@playwright/mcp@latest", "--isolated"], {
  env,
});
```

**What Happens**:
- ✅ Environment variable is set in Cloud Run
- ✅ Our code passes it to the child process
- ❌ `@playwright/mcp` doesn't apply the args to browser launch
- ❌ Chrome crashes immediately

**Question**: Does `@playwright/mcp` support `PLAYWRIGHT_BROWSER_ARGS`? Or is there a different way to pass browser launch arguments?

---

## 🔍 Our Implementation Details

### How We Spawn @playwright/mcp

```typescript
// src/playwright-process.ts
const proc = spawn("npx", ["-y", "@playwright/mcp@latest", "--isolated"], {
  stdio: ["pipe", "pipe", "pipe"],
  shell: process.platform === "win32",
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || undefined,
    PLAYWRIGHT_BROWSER_ARGS: process.env.PLAYWRIGHT_BROWSER_ARGS || undefined,
  },
});

// Send JSON-RPC messages via stdin
proc.stdin.write(JSON.stringify(request) + "\n");

// Receive JSON-RPC responses via stdout
proc.stdout.on("data", (data) => {
  // Parse and handle responses
});
```

### How We Forward Requests

```typescript
// src/mcp-handler.ts
async handle(request: JSONRPCRequest): Promise<JSONRPCResponse> {
  const result = await this.processManager.sendMessage(request);
  return {
    jsonrpc: "2.0",
    id: request.id,
    result,
  };
}
```

### JSON-RPC Request Format

```json
{
  "jsonrpc": "2.0",
  "id": 1234567890,
  "method": "tools/call",
  "params": {
    "name": "browser_navigate",
    "arguments": {
      "url": "https://google.com"
    }
  }
}
```

---

## 🧪 Test Cases

### Test 1: List Tools
```bash
curl -X POST https://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

**Result**: ✅ Works - Returns list of available tools

---

### Test 2: Browser Navigate
```bash
curl -X POST https://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "browser_navigate",
      "arguments": {
        "url": "https://google.com"
      }
    }
  }'
```

**Result**: ❌ Fails with "Invalid URL: undefined" and Chrome sandbox error

---

## 📋 What We've Verified

### ✅ What Works
1. HTTP server receives requests correctly
2. JSON-RPC format is correct (validates against spec)
3. Child process spawns successfully
4. STDIO communication works (we see responses for `tools/list`)
5. Environment variables are passed to child process
6. `--isolated` flag prevents browser lock issues

### ❌ What Doesn't Work
1. URL parameter extraction in `browser_navigate`
2. Browser launch arguments not applied
3. Browser operations fail completely

---

## 🤔 Questions for the Community

### Question 1: Is our JSON-RPC format correct?

We're using:
```json
{
  "method": "tools/call",
  "params": {
    "name": "browser_navigate",
    "arguments": {
      "url": "https://google.com"
    }
  }
}
```

**Is this the correct format?** Or should it be:
- `params.url` instead of `params.arguments.url`?
- Different structure entirely?
- Should we inspect the actual tool schema first?

---

### Question 2: How do we pass browser launch arguments?

We're trying:
```
PLAYWRIGHT_BROWSER_ARGS=--no-sandbox --disable-setuid-sandbox
```

**Does `@playwright/mcp` support this?** Or should we:
- Use a different environment variable name?
- Pass arguments differently?
- Configure via a different mechanism?

---

### Question 3: Are we using @playwright/mcp correctly?

We spawn it via:
```bash
npx -y @playwright/mcp@latest --isolated
```

**Is this the right approach?** Should we:
- Install it locally instead of using `npx`?
- Use different command-line arguments?
- Configure it differently?

---

### Question 4: Cloud Run / Container Environment

**Are there known issues with Playwright in Cloud Run?**
- Does it need special configuration?
- Are there environment-specific requirements?
- Are we missing something obvious?

---

## 🔧 Potential Solutions We're Considering

### Option 1: Fork @playwright/mcp
- Fork the package
- Fix the issues ourselves
- Use our fork until upstream is fixed
- **Downside**: Maintenance burden

### Option 2: Workaround via MCP Protocol
- Intercept requests and transform them
- Modify the request format before forwarding
- **Downside**: Might break other tools

### Option 3: Use Playwright Directly
- Skip `@playwright/mcp` entirely
- Implement MCP protocol ourselves with Playwright
- **Downside**: Significant rewrite required

---

## 📚 Documentation References

### Our Code
- **Main handler**: `src/mcp-handler.ts`
- **Process spawner**: `src/playwright-process.ts`
- **Server**: `src/server.ts`
- **Full repo**: https://github.com/mcpmessenger/playwright-mcp

### @playwright/mcp Package
- **Package**: `@playwright/mcp` (npm)
- **Version**: Latest (via `npx -y @playwright/mcp@latest`)
- **Source**: Likely https://github.com/microsoft/playwright-mcp (needs verification)

### MCP Protocol
- **Spec**: Model Context Protocol specification
- **JSON-RPC**: We're using JSON-RPC 2.0 format

---

## 🐛 Bug Reproduction Steps

1. Deploy to Cloud Run:
```bash
gcloud run deploy playwright-mcp-http-server \
  --image gcr.io/slashmcp/playwright-mcp-http-server:latest \
  --region us-central1 \
  --set-env-vars "PLAYWRIGHT_BROWSER_ARGS=--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu"
```

2. Test browser navigation:
```bash
curl -X POST https://playwright-mcp-http-server-554655392699.us-central1.run.app/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "browser_navigate",
      "arguments": {
        "url": "https://google.com"
      }
    }
  }'
```

3. Observe errors:
- `SyntaxError: browserType.launch: Invalid URL: undefined`
- `Running as root without --no-sandbox is not supported`

---

## 💡 What We Need Help With

### Immediate Help Needed
1. **Verify JSON-RPC format** - Is our request structure correct?
2. **Browser args configuration** - How do we pass launch arguments?
3. **Cloud Run compatibility** - Are we missing something for containerized environments?

### Long-term Help
1. **Code review** - Is our architecture sound?
2. **Best practices** - Are we using Playwright/MCP correctly?
3. **Alternative approaches** - Should we be doing this differently?

---

## 🎁 Recognition & Credit

We will:
- ✅ Credit contributors in project README
- ✅ Add to CONTRIBUTORS.md
- ✅ Mention in release notes
- ✅ Link to GitHub profiles/socials
- ✅ Feature in project documentation

---

## 📞 How to Help

### Option 1: Test & Report
- Deploy our code
- Test the issues
- Share findings

### Option 2: Code Review
- Review our implementation
- Suggest improvements
- Point out what we're missing

### Option 3: Direct Fix
- Fork the repo
- Fix the issues
- Submit PRs

### Option 4: Documentation
- Help document the correct usage
- Share examples
- Clarify the MCP protocol

---

## 🔗 Links

- **GitHub Repo**: https://github.com/mcpmessenger/playwright-mcp
- **Live Service**: https://playwright-mcp-http-server-554655392699.us-central1.run.app
- **Health Check**: https://playwright-mcp-http-server-554655392699.us-central1.run.app/health
- **Issues**: Open an issue on GitHub with `[COMMUNITY]` prefix

---

## 📊 Current Status

**Status**: 🔴 **Blocked** - Waiting for community input

**Blockers**:
1. URL parameter extraction
2. Browser launch arguments

**Progress**:
- ✅ HTTP server implementation: 100%
- ✅ Security features: 100%
- ✅ MCP protocol support: 100%
- ❌ Browser operations: 0% (blocked)

---

## 🙏 Thank You!

Any help, guidance, or feedback is greatly appreciated! We're stuck and would love community input to unblock this project.

**Contact**:
- GitHub Issues: https://github.com/mcpmessenger/playwright-mcp/issues
- Pull Requests: Welcome!
- Discussions: Open for questions

---

**Last Updated**: December 22, 2024  
**Maintainers**: Open to community contributions!

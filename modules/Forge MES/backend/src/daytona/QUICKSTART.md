# Daytona Integration - Quick Start Guide

## 5-Minute Setup

### Step 1: Get Your API Key

1. Visit [https://www.daytona.io](https://www.daytona.io)
2. Sign up or log in
3. Navigate to Settings → API Keys
4. Generate a new API key
5. Copy the key (you'll need it in Step 2)

### Step 2: Configure Environment

Add to your `.env` file:

```bash
DAYTONA_API_KEY=your_api_key_here
```

Optional configuration:

```bash
DAYTONA_API_URL=https://api.daytona.io
DAYTONA_TARGET=production
```

### Step 3: Start the Application

```bash
# From project root
make dev

# Or individually
make dev-backend    # Backend on port 3000
make dev-frontend   # Frontend on port 4000
```

### Step 4: Test the Integration

#### Option A: Using the UI

1. Open browser: `http://localhost:4000/developer-tools`
2. Click "Create Sandbox" tab
3. Select language (e.g., TypeScript)
4. Enter optional name
5. Click "Create Sandbox"
6. Switch to "Execute Code" tab
7. Select your sandbox
8. Enter a command (e.g., `echo "Hello World"`)
9. Click "Execute"

#### Option B: Using GraphQL Playground

1. Open browser: `http://localhost:3000/graphql`
2. Run this query:

```graphql
query {
  daytonaEnabled
}
```

3. If you see `true`, you're all set!

4. Create a sandbox:

```graphql
mutation {
  createSandbox(
    data: {
      language: "typescript"
      name: "My First Sandbox"
      initialCode: "console.log('Hello from Daytona!');"
    }
  ) {
    id
    language
    name
    status
  }
}
```

5. Execute a command:

```graphql
mutation {
  executeCommand(
    data: { sandboxId: "your-sandbox-id-here", command: "node -v" }
  ) {
    stdout
    stderr
    exitCode
    duration
  }
}
```

## Common Use Cases

### Testing Recipe Calculations

```typescript
// Create sandbox for recipe testing
const sandbox = await createSandbox({
  language: "typescript",
  name: "Recipe Calculation Test",
  initialCode: `
    interface RecipeInput {
      quantity: number;
      concentration: number;
    }

    function calculateYield(input: RecipeInput): number {
      return input.quantity * input.concentration;
    }

    console.log(calculateYield({ quantity: 100, concentration: 0.5 }));
  `,
});

// Execute test
const result = await executeCommand({
  sandboxId: sandbox.id,
  command: "node index.ts",
});

console.log("Output:", result.stdout);
```

### AI Code Validation

```typescript
// AI generates code
const aiGeneratedCode = `
  function processIngredients(ingredients) {
    return ingredients.map(i => ({
      ...i,
      processed: true
    }));
  }
`;

// Test in sandbox
const sandbox = await createSandbox({
  language: "javascript",
  name: "AI Code Test",
  initialCode: aiGeneratedCode,
});

// Run tests
const result = await executeCommand({
  sandboxId: sandbox.id,
  command: "npm test",
});

if (result.exitCode === 0) {
  console.log("AI code passed tests!");
} else {
  console.error("AI code failed:", result.stderr);
}
```

## Troubleshooting

### "Daytona service is not enabled"

**Solution**: Check that `DAYTONA_API_KEY` is set in your `.env` file

```bash
# Verify env var
echo $DAYTONA_API_KEY

# If empty, add to .env file
echo "DAYTONA_API_KEY=your_key_here" >> .env

# Restart backend
make dev-backend
```

### "Failed to create sandbox"

**Possible causes**:

1. Invalid API key
2. Network connectivity issues
3. Daytona service outage

**Solution**:

```bash
# Check backend logs
make dev-backend

# Look for errors like:
# [DaytonaService] Failed to initialize Daytona client
```

### "Command execution failed"

**Common issues**:

1. Command timeout (default: 30s)
2. Invalid command syntax
3. Missing dependencies in sandbox

**Solution**: Increase timeout or check command

```graphql
mutation {
  executeCommand(
    data: {
      sandboxId: "your-id"
      command: "npm install && npm test"
      timeout: 120000 # 2 minutes
    }
  ) {
    stdout
    stderr
  }
}
```

## Rate Limits & Quotas

Daytona may have rate limits depending on your plan:

- **Free tier**: Limited sandboxes per hour
- **Paid tier**: Check your plan details

Monitor usage in Daytona dashboard.

## Security Best Practices

1. **Never commit API keys** to version control
2. **Use environment variables** for all secrets
3. **Restrict access** to developer/power users only
4. **Monitor sandbox usage** for anomalies
5. **Set cleanup schedules** to avoid resource leaks

## Getting Help

- **Module Documentation**: `./README.md`
- **Daytona Docs**: https://www.daytona.io/docs
- **Backend Logs**: Check console output when running `make dev-backend`
- **GraphQL Schema**: Visit `http://localhost:3000/graphql` for interactive docs

## Next Steps

Once you've tested the basic integration:

1. **Enable Authentication**: Uncomment guards in `daytona.resolver.ts`
2. **Set Up RBAC**: Configure roles for sandbox access
3. **Add Cleanup Job**: Schedule periodic cleanup of old sandboxes
4. **Integrate with Workflows**: Use sandboxes in recipe validation

---

Happy coding! 🚀

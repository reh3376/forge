Run the CodeRabbit CLI tool to analyze the codebase and fix any issues it identifies.

Steps:
1. Execute `cr --prompt-only` command using the Bash tool with timeout parameter set to 600000 milliseconds (10 minutes) to allow it to complete its analysis
2. Wait for the command to finish unless the user interrupts
3. Analyze the output from CodeRabbit
4. Fix all the issues that CodeRabbit identified in the code
5. Provide a summary of what was fixed

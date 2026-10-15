'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const DAYTONA_ENABLED_QUERY = gql`
  query DaytonaEnabled {
    daytonaEnabled
  }
`;

const MY_SANDBOXES_QUERY = gql`
  query MySandboxes {
    mySandboxes {
      id
      language
      name
      status
      createdAt
      lastActivity
    }
  }
`;

const CREATE_SANDBOX_MUTATION = gql`
  mutation CreateSandbox($data: CreateSandboxDto!) {
    createSandbox(data: $data) {
      id
      language
      name
      status
      createdAt
    }
  }
`;

const EXECUTE_COMMAND_MUTATION = gql`
  mutation ExecuteCommand($data: ExecuteCommandDto!) {
    executeCommand(data: $data) {
      stdout
      stderr
      exitCode
      duration
    }
  }
`;

const DELETE_SANDBOX_MUTATION = gql`
  mutation DeleteSandbox($id: String!) {
    deleteSandbox(id: $id)
  }
`;

export default function DeveloperToolsPage() {
  const [selectedLanguage, setSelectedLanguage] = useState('typescript');
  const [sandboxName, setSandboxName] = useState('');
  const [initialCode, setInitialCode] = useState('console.log("Hello from sandbox");');
  const [selectedSandbox, setSelectedSandbox] = useState<string | null>(null);
  const [command, setCommand] = useState('');
  const [commandResult, setCommandResult] = useState<any>(null);

  const { data: enabledData } = useQuery(DAYTONA_ENABLED_QUERY);
  const { data: sandboxesData, refetch: refetchSandboxes } = useQuery(MY_SANDBOXES_QUERY);

  const [createSandbox, { loading: creating }] = useMutation(CREATE_SANDBOX_MUTATION, {
    onCompleted: () => {
      refetchSandboxes();
      setSandboxName('');
      setInitialCode('');
    },
  });

  const [executeCommand, { loading: executing }] = useMutation(EXECUTE_COMMAND_MUTATION, {
    onCompleted: (data) => {
      setCommandResult(data.executeCommand);
    },
  });

  const [deleteSandbox, { loading: deleting }] = useMutation(DELETE_SANDBOX_MUTATION, {
    onCompleted: () => {
      refetchSandboxes();
      setSelectedSandbox(null);
    },
  });

  const handleCreateSandbox = async () => {
    try {
      await createSandbox({
        variables: {
          data: {
            language: selectedLanguage,
            name: sandboxName || undefined,
            initialCode: initialCode || undefined,
          },
        },
      });
    } catch (error) {
      console.error('Failed to create sandbox:', error);
    }
  };

  const handleExecuteCommand = async () => {
    if (!selectedSandbox || !command) return;

    try {
      await executeCommand({
        variables: {
          data: {
            sandboxId: selectedSandbox,
            command,
          },
        },
      });
    } catch (error) {
      console.error('Failed to execute command:', error);
    }
  };

  const handleDeleteSandbox = async (sandboxId: string) => {
    try {
      await deleteSandbox({
        variables: { id: sandboxId },
      });
    } catch (error) {
      console.error('Failed to delete sandbox:', error);
    }
  };

  const isDaytonaEnabled = enabledData?.daytonaEnabled;

  if (!isDaytonaEnabled) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertDescription>
            Daytona sandbox service is not enabled. Please configure DAYTONA_API_KEY in your environment variables.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Developer Tools</h1>
          <p className="text-muted-foreground">
            AI-assisted code generation and testing with Daytona sandboxes
          </p>
        </div>
      </div>

      <Tabs defaultValue="create" className="space-y-4">
        <TabsList>
          <TabsTrigger value="create">Create Sandbox</TabsTrigger>
          <TabsTrigger value="execute">Execute Code</TabsTrigger>
          <TabsTrigger value="manage">Manage Sandboxes</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>Create New Sandbox</CardTitle>
              <CardDescription>
                Create an isolated environment for testing and development
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="language">Programming Language</Label>
                <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="typescript">TypeScript</SelectItem>
                    <SelectItem value="javascript">JavaScript</SelectItem>
                    <SelectItem value="python">Python</SelectItem>
                    <SelectItem value="go">Go</SelectItem>
                    <SelectItem value="rust">Rust</SelectItem>
                    <SelectItem value="java">Java</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name (Optional)</Label>
                <Input
                  id="name"
                  placeholder="e.g., Recipe calculation test"
                  value={sandboxName}
                  onChange={(e) => setSandboxName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="initialCode">Initial Code (Optional)</Label>
                <Textarea
                  id="initialCode"
                  placeholder="Enter initial code to run..."
                  value={initialCode}
                  onChange={(e) => setInitialCode(e.target.value)}
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>

              <Button onClick={handleCreateSandbox} disabled={creating}>
                {creating ? 'Creating...' : 'Create Sandbox'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="execute">
          <Card>
            <CardHeader>
              <CardTitle>Execute Command</CardTitle>
              <CardDescription>
                Run commands in your active sandboxes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sandbox">Select Sandbox</Label>
                <Select value={selectedSandbox || ''} onValueChange={setSelectedSandbox}>
                  <SelectTrigger id="sandbox">
                    <SelectValue placeholder="Choose a sandbox" />
                  </SelectTrigger>
                  <SelectContent>
                    {sandboxesData?.mySandboxes?.map((sandbox: any) => (
                      <SelectItem key={sandbox.id} value={sandbox.id}>
                        {sandbox.name || sandbox.id} ({sandbox.language})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="command">Command</Label>
                <Input
                  id="command"
                  placeholder="e.g., npm test"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                />
              </div>

              <Button onClick={handleExecuteCommand} disabled={executing || !selectedSandbox}>
                {executing ? 'Executing...' : 'Execute'}
              </Button>

              {commandResult && (
                <div className="space-y-2">
                  <Label>Result</Label>
                  <div className="rounded-md bg-muted p-4 font-mono text-sm space-y-2">
                    {commandResult.stdout && (
                      <div>
                        <div className="font-semibold text-green-600">Output:</div>
                        <pre className="whitespace-pre-wrap">{commandResult.stdout}</pre>
                      </div>
                    )}
                    {commandResult.stderr && (
                      <div>
                        <div className="font-semibold text-red-600">Errors:</div>
                        <pre className="whitespace-pre-wrap">{commandResult.stderr}</pre>
                      </div>
                    )}
                    <div className="text-muted-foreground text-xs">
                      Exit code: {commandResult.exitCode} | Duration: {commandResult.duration}ms
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manage">
          <Card>
            <CardHeader>
              <CardTitle>My Sandboxes</CardTitle>
              <CardDescription>
                View and manage your active sandbox environments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sandboxesData?.mySandboxes?.length === 0 ? (
                  <p className="text-muted-foreground">No sandboxes yet. Create one to get started.</p>
                ) : (
                  sandboxesData?.mySandboxes?.map((sandbox: any) => (
                    <div
                      key={sandbox.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <div className="font-medium">{sandbox.name || 'Unnamed Sandbox'}</div>
                        <div className="text-sm text-muted-foreground">
                          {sandbox.language} | Created: {new Date(sandbox.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteSandbox(sandbox.id)}
                        disabled={deleting}
                      >
                        Delete
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

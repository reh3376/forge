import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrderMutations } from '@/hooks/useOrderMutations';

export const ScheduleOrderMutationTest: React.FC = () => {
  const [scheduleOrderId, setScheduleOrderId] = useState('');
  const [totalProductionDuration, setTotalProductionDuration] = useState('');
  const [testResults, setTestResults] = useState<string[]>([]);
  
  const { updateScheduleOrder, isUpdatingScheduleOrder } = useOrderMutations();

  const addTestResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testTotalDurationUpdate = async () => {
    if (!scheduleOrderId || !totalProductionDuration) {
      addTestResult('❌ Please provide both Schedule Order ID and Total Production Duration');
      return;
    }

    addTestResult(`🔄 Testing update for Schedule Order ID: ${scheduleOrderId}`);
    addTestResult(`📊 Setting estimatedTotalProductionDuration to: ${totalProductionDuration} hours`);

    try {
      const success = await updateScheduleOrder(scheduleOrderId, {
        estimatedTotalProductionDuration: parseFloat(totalProductionDuration)
      });

      if (success) {
        addTestResult('✅ Update successful!');
      } else {
        addTestResult('❌ Update failed - check console for details');
      }
    } catch (error) {
      addTestResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testSimpleFieldUpdate = async () => {
    if (!scheduleOrderId) {
      addTestResult('❌ Please provide Schedule Order ID');
      return;
    }

    addTestResult(`🔄 Testing simple field update for Schedule Order ID: ${scheduleOrderId}`);
    addTestResult(`📝 Setting recipeName to: Test Recipe ${Date.now()}`);

    try {
      const success = await updateScheduleOrder(scheduleOrderId, {
        recipeName: `Test Recipe ${Date.now()}`
      });

      if (success) {
        addTestResult('✅ Simple field update successful!');
      } else {
        addTestResult('❌ Simple field update failed - check console for details');
      }
    } catch (error) {
      addTestResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Schedule Order Mutation Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="schedule-order-id">Schedule Order ID</Label>
          <Input
            id="schedule-order-id"
            value={scheduleOrderId}
            onChange={(e) => setScheduleOrderId(e.target.value)}
            placeholder="Enter schedule order ID to test"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="total-duration">Total Production Duration (hours)</Label>
          <Input
            id="total-duration"
            type="number"
            value={totalProductionDuration}
            onChange={(e) => setTotalProductionDuration(e.target.value)}
            placeholder="Enter duration in hours"
          />
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={testTotalDurationUpdate}
            disabled={isUpdatingScheduleOrder}
          >
            Test Duration Update
          </Button>
          <Button 
            onClick={testSimpleFieldUpdate}
            disabled={isUpdatingScheduleOrder}
            variant="outline"
          >
            Test Simple Field
          </Button>
          <Button 
            onClick={clearResults}
            variant="outline"
          >
            Clear Results
          </Button>
        </div>

        {testResults.length > 0 && (
          <div className="space-y-2">
            <Label>Test Results:</Label>
            <div className="bg-gray-100 p-3 rounded-md max-h-60 overflow-y-auto">
              {testResults.map((result, index) => (
                <div key={index} className="text-sm font-mono">
                  {result}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-sm text-gray-600">
          <p><strong>Instructions:</strong></p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Enter a valid Schedule Order ID from your database</li>
            <li>Enter a duration value (e.g., 24 for 24 hours)</li>
            <li>Click &quot;Test Duration Update&quot; to test the specific field you&apos;re having issues with</li>
            <li>Check the browser console (F12) for detailed logs</li>
            <li>Use &quot;Test Simple Field&quot; to verify basic mutation functionality</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}; 
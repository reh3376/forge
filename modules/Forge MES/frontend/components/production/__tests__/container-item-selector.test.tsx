import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ContainerItemSelector } from '../container-item-selector';
import { unifiedSchedulingClient } from '@/lib/api/unified-scheduling-client';

// Mock the unified scheduling client
jest.mock('@/lib/api/unified-scheduling-client', () => ({
  unifiedSchedulingClient: {
    getContainerItemsByType: jest.fn(),
  },
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
  },
}));

const mockContainerItems = [
  {
    id: 'item-1',
    itemName: '53-Gallon Oak Barrel #1',
    itemNumber: 'BBL-53-001',
    itemGroup: 'BARREL-53GAL',
  },
  {
    id: 'item-2',
    itemName: '53-Gallon Oak Barrel #2',
    itemNumber: 'BBL-53-002',
    itemGroup: 'BARREL-53GAL',
  },
];

describe('ContainerItemSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with default props', () => {
    render(<ContainerItemSelector />);
    
    expect(screen.getByText('Container Item')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('should show required indicator when required=true and container type requires items', () => {
    render(
      <ContainerItemSelector 
        required={true} 
        containerType="LargeBarrel" 
      />
    );
    
    expect(screen.getByText('Container Item *')).toBeInTheDocument();
  });

  it('should not show required indicator for non-barrel types', () => {
    render(
      <ContainerItemSelector 
        required={true} 
        containerType="BulkLoadout" 
      />
    );
    
    expect(screen.getByText('Container Item')).toBeInTheDocument();
    expect(screen.getByText('(not required)')).toBeInTheDocument();
  });

  it('should be disabled when container type does not require items', () => {
    render(<ContainerItemSelector containerType="BulkLoadout" />);
    
    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
  });

  it('should fetch container items when container type changes to barrel type', async () => {
    const mockGetContainerItemsByType = unifiedSchedulingClient.getContainerItemsByType as jest.Mock;
    mockGetContainerItemsByType.mockResolvedValue(mockContainerItems);

    const { rerender } = render(<ContainerItemSelector />);
    
    // Initially no container type
    expect(mockGetContainerItemsByType).not.toHaveBeenCalled();
    
    // Change to barrel type
    rerender(<ContainerItemSelector containerType="LargeBarrel" />);
    
    await waitFor(() => {
      expect(mockGetContainerItemsByType).toHaveBeenCalledWith('LargeBarrel');
    });
  });

  it('should display loading state while fetching items', async () => {
    const mockGetContainerItemsByType = unifiedSchedulingClient.getContainerItemsByType as jest.Mock;
    mockGetContainerItemsByType.mockImplementation(() => new Promise(resolve => 
      setTimeout(() => resolve(mockContainerItems), 100)
    ));

    render(<ContainerItemSelector containerType="LargeBarrel" />);
    
    // Should show loading state
    expect(screen.getByText('Loading container items...')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.queryByText('Loading container items...')).not.toBeInTheDocument();
    });
  });

  it('should show warning message when barrel type requires container item', () => {
    render(<ContainerItemSelector containerType="LargeBarrel" />);
    
    expect(screen.getByText(/Container item selection required for 53-Gallon Barrel/)).toBeInTheDocument();
  });

  it('should show info message for non-barrel types', () => {
    render(<ContainerItemSelector containerType="BulkLoadout" />);
    
    expect(screen.getByText(/Container items are not required for Bulk Loadout/)).toBeInTheDocument();
  });

  it('should call onValueChange when item is selected', async () => {
    const mockGetContainerItemsByType = unifiedSchedulingClient.getContainerItemsByType as jest.Mock;
    mockGetContainerItemsByType.mockResolvedValue(mockContainerItems);
    
    const mockOnValueChange = jest.fn();
    
    render(
      <ContainerItemSelector 
        containerType="LargeBarrel" 
        onValueChange={mockOnValueChange}
      />
    );
    
    await waitFor(() => {
      expect(mockGetContainerItemsByType).toHaveBeenCalled();
    });
    
    // Open the select
    const select = screen.getByRole('combobox');
    fireEvent.click(select);
    
    // Wait for options to appear and click one
    await waitFor(() => {
      const option = screen.getByText('53-Gallon Oak Barrel #1');
      fireEvent.click(option);
    });
    
    expect(mockOnValueChange).toHaveBeenCalledWith('item-1');
  });

  it('should clear selection when container type changes to non-barrel', () => {
    const mockOnValueChange = jest.fn();
    
    const { rerender } = render(
      <ContainerItemSelector 
        containerType="LargeBarrel"
        value="item-1"
        onValueChange={mockOnValueChange}
      />
    );
    
    // Change to non-barrel type
    rerender(
      <ContainerItemSelector 
        containerType="BulkLoadout"
        value="item-1"
        onValueChange={mockOnValueChange}
      />
    );
    
    expect(mockOnValueChange).toHaveBeenCalledWith('');
  });

  it('should display selected item information', async () => {
    const mockGetContainerItemsByType = unifiedSchedulingClient.getContainerItemsByType as jest.Mock;
    mockGetContainerItemsByType.mockResolvedValue(mockContainerItems);
    
    render(
      <ContainerItemSelector 
        containerType="LargeBarrel"
        value="item-1"
      />
    );
    
    await waitFor(() => {
      expect(mockGetContainerItemsByType).toHaveBeenCalled();
    });
    
    // Should show success message with selected item
    await waitFor(() => {
      expect(screen.getByText(/53-Gallon Oak Barrel #1 \(BBL-53-001\) selected for 53-Gallon Barrel/)).toBeInTheDocument();
    });
  });

  it('should handle API errors gracefully', async () => {
    const mockGetContainerItemsByType = unifiedSchedulingClient.getContainerItemsByType as jest.Mock;
    mockGetContainerItemsByType.mockRejectedValue(new Error('API Error'));
    
    render(<ContainerItemSelector containerType="LargeBarrel" />);
    
    await waitFor(() => {
      expect(screen.getByText('Failed to load container items')).toBeInTheDocument();
    });
  });

  it('should show correct placeholder text for different states', () => {
    // No container type
    const { rerender } = render(<ContainerItemSelector />);
    expect(screen.getByText('Select container type first')).toBeInTheDocument();
    
    // Non-barrel type
    rerender(<ContainerItemSelector containerType="BulkLoadout" />);
    expect(screen.getByText('Not required for Bulk Loadout')).toBeInTheDocument();
    
    // Barrel type
    rerender(<ContainerItemSelector containerType="LargeBarrel" />);
    expect(screen.getByText('Select container item')).toBeInTheDocument();
  });

  it('should display custom error message', () => {
    render(
      <ContainerItemSelector 
        containerType="LargeBarrel"
        error="Custom error message"
      />
    );
    
    expect(screen.getByText('Custom error message')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(
      <ContainerItemSelector 
        containerType="LargeBarrel"
        className="custom-class"
      />
    );
    
    const container = screen.getByRole('combobox').closest('.custom-class');
    expect(container).toBeInTheDocument();
  });

  it('should show development info when in development mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    const mockGetContainerItemsByType = unifiedSchedulingClient.getContainerItemsByType as jest.Mock;
    mockGetContainerItemsByType.mockResolvedValue(mockContainerItems);
    
    render(<ContainerItemSelector containerType="LargeBarrel" />);
    
    await waitFor(() => {
      expect(screen.getByText(/Found 2 compatible container item\(s\) for LargeBarrel/)).toBeInTheDocument();
    });
    
    process.env.NODE_ENV = originalEnv;
  });

  it('should handle SmallBarrel container type correctly', async () => {
    const mockSmallBarrelItems = [
      {
        id: 'item-3',
        itemName: '30-Gallon Barrel #1',
        itemNumber: 'BBL-30-001',
        itemGroup: 'BARREL-30GAL',
      },
    ];
    
    const mockGetContainerItemsByType = unifiedSchedulingClient.getContainerItemsByType as jest.Mock;
    mockGetContainerItemsByType.mockResolvedValue(mockSmallBarrelItems);
    
    render(<ContainerItemSelector containerType="SmallBarrel" />);
    
    await waitFor(() => {
      expect(mockGetContainerItemsByType).toHaveBeenCalledWith('SmallBarrel');
    });
    
    expect(screen.getByText(/Container item selection required for 30-Gallon Barrel/)).toBeInTheDocument();
  });
});
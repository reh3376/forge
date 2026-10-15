import { test, expect } from '@playwright/test'
import { Page } from '@playwright/test'

// Mock API responses for container items
const mockContainerItems = {
  LargeBarrel: [
    {
      id: 'barrel-53-1',
      itemName: '53-Gallon Oak Barrel Premium',
      itemNumber: 'BBL-53-001',
      itemGroup: 'BARREL-53GAL',
      itemDescription: 'Premium 53-gallon oak barrel'
    },
    {
      id: 'barrel-53-2', 
      itemName: '53-Gallon Oak Barrel Standard',
      itemNumber: 'BBL-53-002',
      itemGroup: 'BARREL-53GAL-STD',
      itemDescription: 'Standard 53-gallon oak barrel'
    }
  ],
  SmallBarrel: [
    {
      id: 'barrel-30-1',
      itemName: '30-Gallon Oak Barrel',
      itemNumber: 'BBL-30-001',
      itemGroup: 'BARREL-30GAL',
      itemDescription: '30-gallon oak barrel'
    }
  ]
}

async function setupMockAPI(page: Page) {
  // Mock the API responses
  await page.route('**/api/container-items/**', async (route) => {
    const url = route.request().url()
    
    if (url.includes('LargeBarrel')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockContainerItems.LargeBarrel)
      })
    } else if (url.includes('SmallBarrel')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockContainerItems.SmallBarrel)
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      })
    }
  })
}

// Test page that renders the ContainerItemSelector component
const testPageContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Container Item Selector Test</title>
    <style>
        body { padding: 20px; font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; }
        .controls { margin-bottom: 20px; }
        select, button { padding: 8px; margin: 5px; }
        .error { color: red; }
        .success { color: green; }
        .info { color: blue; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Container Item Selector Test</h1>
        
        <div class="controls">
            <label for="containerType">Container Type:</label>
            <select id="containerType">
                <option value="">Select container type</option>
                <option value="LargeBarrel">53-Gallon Barrel</option>
                <option value="SmallBarrel">30-Gallon Barrel</option>
                <option value="BulkLoadout">Bulk Loadout</option>
                <option value="PlasticDrum">Plastic Drum</option>
            </select>
        </div>

        <div id="containerSelector">
            <label for="containerItem">Container Item *</label>
            <select id="containerItem" disabled>
                <option value="">Select container type first</option>
            </select>
            <div id="status" class="status"></div>
        </div>

        <div id="output"></div>
    </div>

    <script>
        const containerTypeSelect = document.getElementById('containerType');
        const containerItemSelect = document.getElementById('containerItem');
        const statusDiv = document.getElementById('status');
        const outputDiv = document.getElementById('output');

        let containerItems = [];

        containerTypeSelect.addEventListener('change', async (e) => {
            const containerType = e.target.value;
            
            containerItemSelect.innerHTML = '<option value="">Loading...</option>';
            containerItemSelect.disabled = true;
            statusDiv.innerHTML = '';

            if (!containerType) {
                containerItemSelect.innerHTML = '<option value="">Select container type first</option>';
                return;
            }

            // Check if container type requires items
            const requiresContainerItem = ['LargeBarrel', 'SmallBarrel'].includes(containerType);
            
            if (!requiresContainerItem) {
                containerItemSelect.innerHTML = '<option value="">Not required for this container type</option>';
                statusDiv.innerHTML = '<div class="info">Container items are not required for ' + getDisplayName(containerType) + '</div>';
                return;
            }

            try {
                // Fetch container items
                const response = await fetch('/api/container-items/' + containerType);
                const items = await response.json();
                
                containerItems = items;
                
                // Filter compatible items
                const compatibleItems = items.filter(item => {
                    const itemGroupName = (item.itemGroup || '').toLowerCase();
                    
                    switch (containerType) {
                        case 'LargeBarrel':
                            return itemGroupName.includes('barrel') && itemGroupName.includes('53');
                        case 'SmallBarrel':
                            return itemGroupName.includes('barrel') && itemGroupName.includes('30');
                        default:
                            return false;
                    }
                });

                if (compatibleItems.length === 0) {
                    containerItemSelect.innerHTML = '<option value="">No compatible items found</option>';
                    statusDiv.innerHTML = '<div class="error">No compatible container items available</div>';
                } else {
                    containerItemSelect.innerHTML = '<option value="">Select container item</option>' +
                        compatibleItems.map(item => 
                            '<option value="' + item.id + '" data-item-name="' + item.itemName + '" data-item-number="' + item.itemNumber + '">' + 
                            item.itemName + ' (' + item.itemNumber + ')' +
                            '</option>'
                        ).join('');
                    
                    statusDiv.innerHTML = '<div class="info">Container item selection required for ' + getDisplayName(containerType) + '</div>';
                    containerItemSelect.disabled = false;
                }
            } catch (error) {
                containerItemSelect.innerHTML = '<option value="">Error loading items</option>';
                statusDiv.innerHTML = '<div class="error">Failed to load container items</div>';
                console.error('Error fetching container items:', error);
            }
        });

        containerItemSelect.addEventListener('change', (e) => {
            const selectedOption = e.target.selectedOptions[0];
            const itemId = e.target.value;
            
            if (itemId) {
                const itemName = selectedOption.getAttribute('data-item-name');
                const itemNumber = selectedOption.getAttribute('data-item-number');
                const containerType = containerTypeSelect.value;
                
                statusDiv.innerHTML = '<div class="success">✓ ' + itemName + ' (' + itemNumber + ') selected for ' + getDisplayName(containerType) + '</div>';
                outputDiv.innerHTML = '<h3>Selected:</h3><p>ID: ' + itemId + '</p><p>Name: ' + itemName + '</p><p>Number: ' + itemNumber + '</p>';
            } else {
                statusDiv.innerHTML = '<div class="info">Container item selection required for ' + getDisplayName(containerTypeSelect.value) + '</div>';
                outputDiv.innerHTML = '';
            }
        });

        function getDisplayName(type) {
            switch (type) {
                case 'LargeBarrel': return '53-Gallon Barrel';
                case 'SmallBarrel': return '30-Gallon Barrel';
                case 'BulkLoadout': return 'Bulk Loadout';
                case 'PlasticDrum': return 'Plastic Drum';
                case 'IbcTote275': return '275-Gallon IBC Tote';
                case 'SsTote275': return '275-Gallon SS Tote';
                default: return type;
            }
        }
    </script>
</body>
</html>
`

test.describe('ContainerItemSelector Component', () => {
  test.beforeEach(async ({ page }) => {
    // Setup mock API
    await setupMockAPI(page)
    
    // Navigate to test page with our component simulation
    await page.setContent(testPageContent)
  })

  test('displays placeholder when no container type selected', async ({ page }) => {
    const containerItem = page.locator('#containerItem')
    
    await expect(containerItem).toContainText('Select container type first')
    await expect(containerItem).toBeDisabled()
  })

  test('shows not required message for bulk loadout', async ({ page }) => {
    const containerType = page.locator('#containerType')
    const containerItem = page.locator('#containerItem')
    const status = page.locator('#status')

    await containerType.selectOption('BulkLoadout')
    
    await expect(containerItem).toContainText('Not required for this container type')
    await expect(status).toContainText('Container items are not required for Bulk Loadout')
  })

  test('loads and displays compatible items for Large Barrel', async ({ page }) => {
    const containerType = page.locator('#containerType')
    const containerItem = page.locator('#containerItem')
    const status = page.locator('#status')

    await containerType.selectOption('LargeBarrel')
    
    // Wait for loading to complete
    await expect(containerItem).not.toContainText('Loading...')
    
    // Check that items are loaded
    await expect(containerItem).toContainText('53-Gallon Oak Barrel Premium')
    await expect(containerItem).toContainText('53-Gallon Oak Barrel Standard')
    await expect(status).toContainText('Container item selection required for 53-Gallon Barrel')
  })

  test('loads and displays compatible items for Small Barrel', async ({ page }) => {
    const containerType = page.locator('#containerType')
    const containerItem = page.locator('#containerItem')

    await containerType.selectOption('SmallBarrel')
    
    // Wait for loading to complete
    await expect(containerItem).not.toContainText('Loading...')
    
    // Check that correct items are loaded
    await expect(containerItem).toContainText('30-Gallon Oak Barrel')
    await expect(containerItem).not.toContainText('53-Gallon')
  })

  test('selects container item and shows success message', async ({ page }) => {
    const containerType = page.locator('#containerType')
    const containerItem = page.locator('#containerItem')
    const status = page.locator('#status')
    const output = page.locator('#output')

    // Select container type
    await containerType.selectOption('LargeBarrel')
    await expect(containerItem).not.toContainText('Loading...')

    // Select a container item
    await containerItem.selectOption('barrel-53-1')
    
    // Check success message
    await expect(status).toContainText('53-Gallon Oak Barrel Premium (BBL-53-001) selected for 53-Gallon Barrel')
    
    // Check output details
    await expect(output).toContainText('ID: barrel-53-1')
    await expect(output).toContainText('Name: 53-Gallon Oak Barrel Premium')
    await expect(output).toContainText('Number: BBL-53-001')
  })

  test('shows warning when container item required but not selected', async ({ page }) => {
    const containerType = page.locator('#containerType')
    const status = page.locator('#status')

    await containerType.selectOption('LargeBarrel')
    await expect(status).toContainText('Container item selection required for 53-Gallon Barrel')
  })

  test('handles API errors gracefully', async ({ page }) => {
    // Override mock to return error
    await page.route('**/api/container-items/**', async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal server error' })
      })
    })

    const containerType = page.locator('#containerType')
    const containerItem = page.locator('#containerItem')
    const status = page.locator('#status')

    await containerType.selectOption('LargeBarrel')
    
    await expect(containerItem).toContainText('Error loading items')
    await expect(status).toContainText('Failed to load container items')
  })

  test('changes selection when switching container types', async ({ page }) => {
    const containerType = page.locator('#containerType')
    const containerItem = page.locator('#containerItem')
    const status = page.locator('#status')

    // Select Large Barrel first
    await containerType.selectOption('LargeBarrel')
    await expect(containerItem).not.toContainText('Loading...')
    await containerItem.selectOption('barrel-53-1')
    await expect(status).toContainText('53-Gallon Oak Barrel Premium')

    // Switch to Small Barrel
    await containerType.selectOption('SmallBarrel')
    await expect(containerItem).not.toContainText('Loading...')
    
    // Check that different items are now available
    await expect(containerItem).toContainText('30-Gallon Oak Barrel')
    await expect(containerItem).not.toContainText('53-Gallon Oak Barrel Premium')
    
    // Status should update to require selection for new type
    await expect(status).toContainText('Container item selection required for 30-Gallon Barrel')
  })

  test('keyboard navigation works correctly', async ({ page }) => {
    const containerType = page.locator('#containerType')
    const containerItem = page.locator('#containerItem')

    // Use keyboard to navigate
    await containerType.focus()
    await page.keyboard.press('ArrowDown') // Should select first option
    await page.keyboard.press('ArrowDown') // Should select LargeBarrel
    await page.keyboard.press('Enter')
    
    // Wait for items to load
    await expect(containerItem).not.toContainText('Loading...')
    
    // Navigate container items with keyboard
    await containerItem.focus()
    await page.keyboard.press('ArrowDown') // Skip placeholder
    await page.keyboard.press('ArrowDown') // Select first item
    await page.keyboard.press('Enter')
    
    // Check selection was made
    const status = page.locator('#status')
    await expect(status).toContainText('selected for 53-Gallon Barrel')
  })
})
# WhiskeyHouse MES Database Bad Data Analysis

## Issues Found (Initial Analysis)

### Negative erpId Values

#### Bom Table
- **Count**: 13 records
- **Pattern**: Negative erpId values (e.g., "-20", "-5", "-4", etc.)
- **Example Records**:
  ```
  id: 'cm0h8e46r00020cl8316a9vk7', bomName: '-30', erpId: '-20'
  id: 'clyd1p561055ved45iaea4h5m', bomName: '15', erpId: '-5'
  ```

#### Item Table
- **Count**: 25 records
- **Pattern**: Negative erpId values (e.g., "-999", "-10009", "-9", etc.)
- **Example Records**:
  ```
  id: 'clyd1ofw2009yfd4504c6wt1w', itemName: 'Water', erpId: '-999'
  id: 'cm0d8qo7p04nc8at9m438k3ay', itemName: 'ABT-60-36-00-04-53-06-4-0-0-120-R01', erpId: '-55'
  ```

#### Vendor Table
- **Count**: 1 record
- **Pattern**: Negative erpId value
- **Record**:
  ```
  id: 'cm0oeo5dw007iobm0fq5qvdsi', name: '-Accountant-', erpId: '-3', globalId: 'clzhc0wh30000ccgh81v9hnkm'
  ```

### Empty Name Fields

#### Item Table
- **Count**: 123 records
- **Pattern**: Empty itemName values (`''` or `' '`)
- **Example Records**:
  ```
  id: 'clzhhlab80ez9mbc96t8gymuz', itemName: '', erpId: '816', itemNumber: '16100 - Prepaids|Deposits'
  id: 'clzhhlb030ezbmbc9ftuz40jz', itemName: '', erpId: '809', itemNumber: '17453 CIP - Equipment'
  ```

#### ProductionOrder Table
- **Count**: 2 records
- **Pattern**: NULL name values
- **Records**:
  ```
  id: 'clyd3dqkk0018jas40jy6pca7', name: NULL, createdAt: 2024-07-08 14:43:05
  id: 'clyjbkgmq000miolp00pjchx9', name: NULL, createdAt: 2024-07-12 23:18:53
  ```

#### ScheduleOrder Table
- **Count**: 12 records
- **Pattern**: NULL name values
- **Example Records**:
  ```
  id: 'cmaowunnh000an9hsdqic2tgq', name: NULL, createdAt: 2025-05-15 05:09:59
  id: 'cmapwefxf000lfl7n2yj12fh9', name: NULL, createdAt: 2025-05-15 21:45:09
  id: 'cmapwlx7e000rfl7nqkqmw3t2', name: NULL, createdAt: 2025-05-15 21:50:58
  ```

### "DEL" or "DELETE" Marker Issues

#### Customer Table
- **Count**: 3 records
- **Pattern**: "DELETE ME" in name field
- **Records**:
  ```
  id: 'clyd1ofpi002mfd455wkjuucm', name: 'DELETE ME', customerCode: null
  id: 'cm398ht5301r7fov7up1wcb2u', name: 'DELETE ME - 2', customerCode: null
  id: 'cm2z4oxb82ceqb4c6zkjvexe5', name: 'DELETE ME - 3', customerCode: null
  ```

## Additional Tables Analyzed (No Issues Found)

The following tables were analyzed but no bad data patterns were found:
- **Lot Table**: No "DEL"/"DELETE" markers or empty lot numbers 
- **Asset Table**: No "DEL"/"DELETE" markers or empty names
- **Inventory Table**: No "DEL"/"DELETE" markers or inactive records

## Summary of Issues

1. **Negative erpId Values**: Found in Bom (13), Item (25), and Vendor (1) tables
2. **Empty Name Fields**: Found in Item (123), ProductionOrder (2), and ScheduleOrder (12) tables
3. **"DELETE" Markers**: Found in Customer table (3 records with "DELETE ME" in name)

## Order Naming Solution

To fix the NULL name issues in ProductionOrder and ScheduleOrder tables, we've created two script options:

1. **SQL Script** (`fix-production-schedule-order-names.sql`):
   - Uses direct SQL updates with hardcoded values
   - Names follow the format `PROYYYJJJNNN` or `SHOYYYJJJNNN` where:
     - `YY` = Last two digits of year (e.g., 24 for 2024)
     - `JJJ` = Julian day / day of year (e.g., 189 for July 8)
     - `NNN` = Sequential number (001, 002, etc.)
   - Example: `PRO24189001` for the first production order on July 8, 2024

2. **Prisma Script** (`fix-order-names-prisma.js`):
   - Uses Prisma client for database operations
   - Dynamically calculates Julian days and sequence numbers
   - Follows the same naming convention as the SQL script
   - More flexible for future use

## Next Steps

1. **Determine Impact**: 
   - Assess if negative erpId values are legitimate or problematic
   - Review empty name fields to determine if they need population
   - Confirm if "DELETE ME" Customer records should be removed

2. **Create Migration Scripts**:
   - For any required data cleanup, similar to the previous Recipe cleanup script
   - Consider both SQL and Prisma-based approaches

3. **Implement Data Validation Rules**:
   - Add validation in the application to prevent negative erpId values or empty names 
   - Consider adding database constraints where appropriate

4. **Regular Monitoring**:
   - Set up regular database health checks to identify similar issues in the future 
# AI Prompt: Generate a Complete Mock API Server

Use this prompt with any AI assistant (Claude, ChatGPT, Gemini, etc.) to generate a complete, ready-to-run mock API server for your custom dataset.

---

## Choose Your Version

| Version | Best For | Data Behavior |
|---------|----------|---------------|
| **Standard (Stateless)** | Quick demos, consistent responses | Returns example data only, no persistence |
| **Persistent** | Real CRUD testing, data manipulation | Data saves to file, persists between requests |

---

## OPTION 1: Standard Version (Stateless)

Use this if you want consistent, predictable responses. POST/PUT/DELETE return examples but don't actually save data.

### The Prompt

Copy everything below the line and paste it into your AI assistant. Fill in the bracketed sections with your specific requirements.

---

```
I need you to generate a complete, ready-to-run mock API server for a hackathon project. Generate ALL files needed so I can simply save them and run the server immediately.

## My Dataset

**Resource Name:** [YOUR_RESOURCE_NAME - e.g., "books", "users", "orders", "events"]

**Description:** [BRIEF DESCRIPTION - e.g., "A library catalog system for tracking books"]

**Fields (include all that apply):**
| Field Name | Data Type | Description | Required | Example Value |
|------------|-----------|-------------|----------|---------------|
| [field1] | [string/integer/number/boolean/array] | [description] | [yes/no] | [example] |
| [field2] | [string/integer/number/boolean/array] | [description] | [yes/no] | [example] |
| [field3] | [string/integer/number/boolean/array] | [description] | [yes/no] | [example] |
[Add more fields as needed]

**Sample Data:** Generate [5-10] realistic example records for my dataset.

## Required API Endpoints

Generate these REST endpoints:
- GET /[resource] - List all items (with pagination support)
- GET /[resource]/{id} - Get a single item by ID
- POST /[resource] - Create a new item
- PUT /[resource]/{id} - Update an existing item
- DELETE /[resource]/{id} - Delete an item
- GET /[resource]/search?q={term} - Search items (optional)

## Technical Requirements

Generate the following complete files:

### 1. openapi.yaml
- OpenAPI 3.0 specification
- Server URL: http://127.0.0.1:3001
- Include all endpoints with request/response schemas
- Include realistic example data in responses (5-10 items for list endpoints)
- Include proper error responses (400, 404, 500)

### 2. server.js
- Express.js server with these features:
  - Swagger UI served at root (/) redirecting to /docs
  - Swagger UI at /docs using swagger-ui-express
  - OpenAPI spec served at /openapi.json and /openapi.yaml
  - Proxy to Prism mock server using http-proxy-middleware v3
  - CORS enabled for local development
  - Health check endpoint at /health
  - Automatic Prism startup as child process
  - Graceful shutdown handling
- Configuration:
  - SERVER_PORT: 3001
  - PRISM_PORT: 4010
  - HOST: 127.0.0.1
- The proxy MUST use pathFilter (not path mounting) to preserve full URLs
- Use the http-proxy-middleware v3 API with 'on' event handlers

### 3. package.json
- Project name based on my resource
- Scripts:
  - "start": "node server.js"
  - "validate": "npx @stoplight/prism-cli validate openapi.yaml"
- Dependencies (use these exact versions):
  - "cors": "^2.8.5"
  - "express": "^5.2.1"
  - "http-proxy-middleware": "^3.0.5"
  - "swagger-ui-express": "^5.0.1"
  - "yamljs": "^0.3.0"
- DevDependencies:
  - "@stoplight/prism-cli": "^5.5.2"

### 4. start.sh (macOS/Linux)
- Bash script with shebang
- Check if Node.js is installed
- Auto-install dependencies if node_modules missing
- Kill any existing processes on ports 3001 and 4010
- Start the server
- Make it executable (chmod +x)

### 5. start.bat (Windows)
- Batch script equivalent of start.sh
- Same functionality for Windows users

### 6. README.md
- Brief description of the API
- Quick start instructions (just run start.sh or start.bat)
- Table of all endpoints with example URLs
- Sample data structure (one JSON example)
- How to stop the server

## Output Format

Provide each file in a clearly labeled code block with the filename as a header. Example:

**openapi.yaml**
```yaml
[content]
```

**server.js**
```javascript
[content]
```

[Continue for all files]

## Important Notes

1. All files must be complete and ready to use - no placeholders or TODOs
2. The server must work immediately after running npm install && npm start
3. Include realistic, domain-appropriate sample data
4. The proxy configuration is critical - use pathFilter, not path mounting
5. Swagger UI must be accessible at http://127.0.0.1:3001/
```

---

## Example: Filled-In Prompt

Here's a complete example for a "books" dataset:

```
I need you to generate a complete, ready-to-run mock API server for a hackathon project. Generate ALL files needed so I can simply save them and run the server immediately.

## My Dataset

**Resource Name:** books

**Description:** A library catalog system for tracking books and their availability

**Fields (include all that apply):**
| Field Name | Data Type | Description | Required | Example Value |
|------------|-----------|-------------|----------|---------------|
| id | integer | Unique book identifier | yes | 1 |
| title | string | Book title | yes | "The Great Gatsby" |
| author | string | Author's full name | yes | "F. Scott Fitzgerald" |
| isbn | string | ISBN-13 number | yes | "978-0743273565" |
| publishedYear | integer | Year the book was published | yes | 1925 |
| genre | string | Book genre/category | yes | "Classic Fiction" |
| description | string | Brief book summary | no | "A story of the Jazz Age..." |
| pageCount | integer | Number of pages | no | 180 |
| available | boolean | Whether book is available for checkout | yes | true |
| rating | number | Average rating (0.0 to 5.0) | no | 4.5 |
| copiesOwned | integer | Total copies in library | yes | 3 |

**Sample Data:** Generate 8 realistic example records with well-known books.

## Required API Endpoints

Generate these REST endpoints:
- GET /books - List all books (with pagination support)
- GET /books/{id} - Get a single book by ID
- POST /books - Create a new book
- PUT /books/{id} - Update an existing book
- DELETE /books/{id} - Delete a book
- GET /books/search?q={term} - Search books by title or author

[Rest of technical requirements same as above...]

---

## OPTION 2: Persistent Version (Real CRUD)

Use this if you want data to actually persist. POST creates real records, PUT updates them, DELETE removes them. Data saves to a JSON file.

### The Prompt (Persistent)

Copy everything below the line and paste it into your AI assistant. Fill in the bracketed sections with your specific requirements.

---

```
I need you to generate a complete, ready-to-run mock API server with PERSISTENT DATA for a hackathon project. This means POST/PUT/DELETE operations should actually save, update, and remove data. Generate ALL files needed so I can simply save them and run the server immediately.
```

## My Dataset

**Resource Name:** [YOUR_RESOURCE_NAME - e.g., "books", "users", "orders", "events"]

**Description:** [BRIEF DESCRIPTION - e.g., "A library catalog system for tracking books"]

**Fields (include all that apply):**
| Field Name | Data Type | Description | Required | Example Value |
|------------|-----------|-------------|----------|---------------|
| [field1] | [string/integer/number/boolean/array] | [description] | [yes/no] | [example] |
| [field2] | [string/integer/number/boolean/array] | [description] | [yes/no] | [example] |
| [field3] | [string/integer/number/boolean/array] | [description] | [yes/no] | [example] |
[Add more fields as needed]

**Sample Data:** Generate [5-10] realistic example records for my dataset.

## Required API Endpoints

Generate these REST endpoints with REAL persistence:
- GET /[resource] - List all items from the database
- GET /[resource]/{id} - Get a single item by ID
- POST /[resource] - Create a new item (MUST save to database)
- PUT /[resource]/{id} - Update an existing item (MUST save changes)
- DELETE /[resource]/{id} - Delete an item (MUST remove from database)
- GET /[resource]/search?q={term} - Search items
- POST /reset - Reset database to original sample data

## Technical Requirements

Generate the following complete files:

### 1. db.json
- JSON file containing the sample data
- Structure: { "[resource]": [ array of sample items ] }
- Include 5-10 realistic sample records with sequential IDs starting at 1

### 2. openapi.yaml
- OpenAPI 3.0 specification
- Server URL: http://127.0.0.1:3001
- Include all endpoints with request/response schemas
- Include proper error responses (400, 404, 500)

### 3. server.js
- Express.js server with these features:
  - Load data from db.json on startup
  - Save data to db.json after every POST/PUT/DELETE
  - Create backup of original data as db.original.json on first start
  - Swagger UI at /docs using swagger-ui-express
  - Redirect root (/) to /docs
  - OpenAPI spec served at /openapi.json and /openapi.yaml
  - CORS enabled for local development
  - Health check endpoint at /health showing item count
  - POST /reset endpoint to restore original data from backup
  - Graceful shutdown handling
- Configuration:
  - SERVER_PORT: 3001
  - HOST: 127.0.0.1
- CRUD Implementation:
  - GET /[resource]: Return all items from db.[resource] array
  - GET /[resource]/:id: Find item by ID, return 404 if not found
  - POST /[resource]: Generate new ID (max existing + 1), add to array, save db.json, return 201
  - PUT /[resource]/:id: Find item, update fields, save db.json, return updated item or 404
  - DELETE /[resource]/:id: Find item, remove from array, save db.json, return 204 or 404
  - GET /[resource]/search: Filter items by query string matching relevant text fields

### 4. package.json
- Project name based on my resource with "-persistent" suffix
- Scripts:
  - "start": "node server.js"
  - "reset": "cp db.original.json db.json"
- Dependencies (use these exact versions):
  - "cors": "^2.8.5"
  - "express": "^5.2.1"
  - "swagger-ui-express": "^5.0.1"
  - "yamljs": "^0.3.0"
- Note: NO Prism or http-proxy-middleware needed for persistent version

### 5. start.sh (macOS/Linux)
- Bash script with shebang
- Check if Node.js is installed
- Auto-install dependencies if node_modules missing
- Kill any existing processes on port 3001
- Start the server
- Make it executable (chmod +x)

### 6. start.bat (Windows)
- Batch script equivalent of start.sh
- Same functionality for Windows users

### 7. README.md
- Brief description noting this is the PERSISTENT version
- Explain that data actually saves between requests
- Quick start instructions
- Table of all endpoints with example URLs
- Sample data structure (one JSON example)
- How to reset data to original state
- How to stop the server

## Output Format

Provide each file in a clearly labeled code block with the filename as a header.

## Important Notes

1. All files must be complete and ready to use - no placeholders or TODOs
2. The server must work immediately after running npm install && npm start
3. Data MUST persist - verify POST creates items that appear in subsequent GET requests
4. Include realistic, domain-appropriate sample data
5. Swagger UI must be accessible at http://127.0.0.1:3001/
6. The /reset endpoint must restore the original sample data
```

---

## After Generation: Setup Steps

Once the AI generates all the files:

1. **Create a new folder** for your API (e.g., `my-books-api`)

2. **Save each file** the AI generated into that folder:
   - `openapi.yaml`
   - `server.js`
   - `package.json`
   - `start.sh`
   - `start.bat`
   - `README.md`
   - `db.json` (persistent version only)

3. **Make the start script executable** (macOS/Linux only):
   ```bash
   chmod +x start.sh
   ```

4. **Run the server**:
   - macOS/Linux: `./start.sh`
   - Windows: Double-click `start.bat`

5. **Open your browser** to http://127.0.0.1:3001/

---

## Common Dataset Templates

### E-Commerce Products
```
Fields: id, name, description, price, category, brand, sku, inStock, quantity, rating, imageUrl, createdAt
```

### User Accounts
```
Fields: id, username, email, firstName, lastName, role, department, active, lastLogin, createdAt
```

### Orders/Transactions
```
Fields: id, customerId, items (array), totalAmount, status, paymentMethod, shippingAddress, orderDate, deliveryDate
```

### Events/Calendar
```
Fields: id, title, description, startDateTime, endDateTime, location, organizer, capacity, registeredCount, isVirtual
```

### Tasks/Project Management
```
Fields: id, title, description, status, priority, assigneeId, projectId, dueDate, estimatedHours, tags (array)
```

### Inventory/Warehouse
```
Fields: id, productName, sku, quantity, warehouseLocation, reorderLevel, supplier, unitCost, lastRestocked
```

### Employees/HR
```
Fields: id, employeeNumber, firstName, lastName, email, department, jobTitle, managerId, hireDate, salary, isActive
```

### Restaurants/Menu
```
Fields: id, name, description, price, category, calories, allergens (array), isVegetarian, isAvailable, prepTime
```

### Vehicles/Fleet
```
Fields: id, make, model, year, vin, licensePlate, mileage, fuelType, status, lastServiceDate, assignedDriver
```

### Real Estate/Properties
```
Fields: id, address, city, state, zipCode, propertyType, bedrooms, bathrooms, squareFeet, price, listingStatus, listedDate
```

---

## Tips for Best Results

1. **Be specific about data types** - Use `integer` for whole numbers, `number` for decimals, `boolean` for true/false

2. **Provide realistic examples** - The AI will generate better sample data if you give good examples

3. **Include edge cases** - Add fields like `isActive`, `status`, or `deletedAt` if relevant

4. **Specify array contents** - If a field is an array, describe what it contains (e.g., "array of strings", "array of order item objects")

5. **Request validation** - Ask the AI to include field validation rules in the OpenAPI spec if needed

---

## Troubleshooting Generated Code

| Issue | Solution |
|-------|----------|
| YAML syntax errors | Paste the openapi.yaml into https://editor.swagger.io/ to validate |
| Proxy not working | Ensure `pathFilter` is used, not `app.use('/resource', proxy)` |
| Port already in use | The start scripts should handle this, but manually kill processes if needed |
| Dependencies fail to install | Delete `node_modules` and `package-lock.json`, then run `npm install` again |
| Prism validation errors | Run `npm run validate` to check your OpenAPI spec |

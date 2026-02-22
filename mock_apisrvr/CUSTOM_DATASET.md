# Creating Your Own Mock API Dataset

Want to use different data than the products example? Follow these steps.

---

## Option 1: Use AI to Generate (Recommended)

Copy this prompt into ChatGPT, Claude, or your preferred AI assistant:

```
Generate an OpenAPI 3.0 specification in YAML format for a mock REST API with the following:

Dataset: [YOUR_DATASET_NAME]
Description: [WHAT THIS DATA REPRESENTS]

Fields:
- [field1]: [type] - [description]
- [field2]: [type] - [description]
- [field3]: [type] - [description]
(add more fields as needed)

Requirements:
1. Include these endpoints:
   - GET /[resource] - List all items (include 5-10 example items)
   - GET /[resource]/{id} - Get single item
   - POST /[resource] - Create item
   - PUT /[resource]/{id} - Update item
   - DELETE /[resource]/{id} - Delete item

2. Server URL should be: http://127.0.0.1:3001

3. Include realistic example data in the responses

4. Use these data types: string, integer, number (for decimals), boolean

Output only the YAML file content, no explanations.
```

### Example Filled-In Prompt

```
Generate an OpenAPI 3.0 specification in YAML format for a mock REST API with the following:

Dataset: books
Description: A library catalog system

Fields:
- id: integer - Unique book identifier
- title: string - Book title
- author: string - Author's full name
- isbn: string - ISBN-13 number
- publishedYear: integer - Year published
- genre: string - Book genre
- available: boolean - Whether book is available for checkout
- rating: number - Average rating (0.0 to 5.0)

Requirements:
1. Include these endpoints:
   - GET /books - List all books (include 5-10 example items)
   - GET /books/{id} - Get single book
   - POST /books - Create book
   - PUT /books/{id} - Update book
   - DELETE /books/{id} - Delete book

2. Server URL should be: http://127.0.0.1:3001

3. Include realistic example data in the responses

4. Use these data types: string, integer, number (for decimals), boolean

Output only the YAML file content, no explanations.
```

---

## Option 2: Copy and Modify

1. Copy the `examples/products-api` folder
2. Rename it to your dataset name (e.g., `examples/books-api`)
3. Edit `openapi.yaml` to change:
   - The `info.title` and `info.description`
   - The path names (`/products` → `/books`)
   - The schema properties
   - The example data

4. Edit `server.js` line 106 to change the path filter:
   ```javascript
   pathFilter: '/books',  // Change from '/products' to your resource
   ```

---

## Setting Up Your Custom API

After creating your `openapi.yaml`:

1. Copy the entire `examples/products-api` folder
2. Replace `openapi.yaml` with your generated file
3. Update `server.js` line 106 to match your resource path
4. Run `./start.sh` (macOS/Linux) or `start.bat` (Windows)

---

## Common Dataset Ideas

### Books/Library
```
Fields: id, title, author, isbn, publishedYear, genre, available, rating
```

### Users/Accounts
```
Fields: id, username, email, firstName, lastName, role, active, createdAt
```

### Orders/Transactions
```
Fields: id, customerId, items, totalAmount, status, orderDate, shippingAddress
```

### Events/Calendar
```
Fields: id, title, description, startDate, endDate, location, organizer, capacity
```

### Tasks/Todos
```
Fields: id, title, description, status, priority, dueDate, assignee, completed
```

### Inventory/Stock
```
Fields: id, productName, sku, quantity, warehouse, reorderLevel, lastUpdated
```

---

## Data Type Reference

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text | `"Hello World"` |
| `integer` | Whole numbers | `42` |
| `number` | Decimals | `19.99` |
| `boolean` | True/false | `true` |
| `array` | List of items | `["a", "b", "c"]` |

---

## Need Help?

If your generated API doesn't work:

1. Validate your YAML at https://editor.swagger.io/
2. Make sure all paths start with `/`
3. Ensure the server URL is `http://127.0.0.1:3001`
4. Check that `pathFilter` in `server.js` matches your resource path

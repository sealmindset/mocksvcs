# Mock API Server for Hackathon

A ready-to-use mock REST API server for your hackathon projects. Get a fully functional API running in **under 2 minutes**.

---

## Prerequisites

Before starting, ensure you have the following installed on your laptop:

### Required Software

| Software | Version | Download | Purpose |
|----------|---------|----------|---------|
| **Node.js** | v18 or higher (LTS recommended) | https://nodejs.org/ | Runs the mock server |
| **Git** | Any recent version | https://git-scm.com/ | Downloads the project |

### Permissions Required

| Platform | Installation | Running the Server |
|----------|--------------|--------------------|
| **macOS** | Admin password required for installers | No admin rights needed |
| **Windows** | Admin rights required for installers | No admin rights needed |

> **Note:** You only need admin/root access to install Node.js and Git. Once installed, running the mock server does NOT require elevated privileges.

### macOS Installation

#### Option A: Using Homebrew (Recommended)

If you have Homebrew installed (https://brew.sh/):

```bash
# Install Node.js and Git in one command
brew install node git

# Verify installation
node --version    # Should show v18.x.x or higher
npm --version     # Should show 9.x.x or higher
git --version     # Should show git version 2.x.x
```

To install Homebrew first (if needed):
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### Option B: Manual Installation

1. **Node.js**: 
   - Go to https://nodejs.org/
   - Click the **LTS** button (green)
   - Download and run the `.pkg` installer
   - Follow the installation wizard

2. **Git**: 
   - Usually pre-installed on macOS
   - To check, open Terminal and type: `git --version`
   - If not installed, you'll be prompted to install Xcode Command Line Tools

3. **Verify Installation** (open Terminal):
   ```bash
   node --version    # Should show v18.x.x or higher
   npm --version     # Should show 9.x.x or higher
   git --version     # Should show git version 2.x.x
   ```

### Windows Installation

#### Option A: Using winget (Built into Windows 10/11)

Open PowerShell or Command Prompt:

```powershell
# Install Node.js and Git
winget install OpenJS.NodeJS.LTS
winget install Git.Git

# Restart your terminal, then verify
node --version
npm --version
git --version
```

#### Option B: Using Chocolatey

If you have Chocolatey installed (https://chocolatey.org/install):

```powershell
# Run as Administrator
choco install nodejs-lts git -y

# Restart your terminal, then verify
node --version
npm --version
git --version
```

#### Option C: Using Scoop

If you have Scoop installed (https://scoop.sh/):

```powershell
# Install Node.js and Git
scoop install nodejs-lts git

# Verify installation
node --version
npm --version
git --version
```

#### Option D: Manual Installation

1. **Node.js**:
   - Go to https://nodejs.org/
   - Click the **LTS** button (green)
   - Download and run the `.msi` installer
   - **Important**: Check "Automatically install necessary tools" during installation
   - Restart your computer after installation

2. **Git**:
   - Go to https://git-scm.com/download/win
   - Download and run the installer
   - Use default options (click Next through the wizard)

3. **Verify Installation** (open Command Prompt or PowerShell):
   ```cmd
   node --version    # Should show v18.x.x or higher
   npm --version     # Should show 9.x.x or higher
   git --version     # Should show git version 2.x.x
   ```

### Troubleshooting Prerequisites

| Issue | Solution |
|-------|----------|
| `node: command not found` | Restart your terminal/computer after installing Node.js |
| `git: command not found` | Install Git from https://git-scm.com/ |
| Node version below v18 | Uninstall old version, download latest LTS from nodejs.org |
| Windows: "not recognized as internal command" | Restart computer, or reinstall with "Add to PATH" checked |

---

## Quick Start (2 Minutes)

### Step 1: Download This Project

```bash
git clone https://github.com/SleepNumberInc/mockapisvr.git
```

### Step 2: Choose Your Version

| Version | Folder | Best For |
|---------|--------|----------|
| **Standard** | `examples/products-api` | Quick demos, stateless testing |
| **Persistent** | `examples/products-api-persistent` | Real CRUD, data saves between requests |

```bash
# Standard version (data resets each request)
cd mockapisvr/examples/products-api

# OR Persistent version (data actually saves)
cd mockapisvr/examples/products-api-persistent
```

### Step 3: Start the Server

**macOS/Linux:**
```bash
./start.sh
```

**Windows:**
```
Double-click start.bat
```

### Step 4: Use Your API

Once you see "Mock API Server is running!", open your browser:

| URL | Description |
|-----|-------------|
| http://127.0.0.1:3001/ | **Swagger UI** - Interactive API documentation |
| http://127.0.0.1:3001/products | Get all products (JSON) |
| http://127.0.0.1:3001/products/1 | Get product by ID |

---

## What You Get

A fully functional REST API with:

- **5 sample products** with realistic data
- **Full CRUD operations** (Create, Read, Update, Delete)
- **Swagger UI** for interactive testing
- **No database required** - data resets on restart

### Available Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/products` | List all products |
| GET | `/products/{id}` | Get a single product |
| POST | `/products` | Create a new product |
| PUT | `/products/{id}` | Update a product |
| DELETE | `/products/{id}` | Delete a product |
| GET | `/products/search?q=term` | Search products |

### Sample Data Structure

```json
{
  "id": 1,
  "name": "MacBook Pro 16-inch",
  "description": "Apple M3 Pro chip, 18GB RAM, 512GB SSD",
  "price": 2499.99,
  "category": "Electronics",
  "inStock": true,
  "quantity": 25,
  "sku": "APPLE-MBP16-M3",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

---

## Using the API in Your Code

### JavaScript/Fetch

```javascript
// Get all products
const response = await fetch('http://127.0.0.1:3001/products');
const products = await response.json();

// Get single product
const product = await fetch('http://127.0.0.1:3001/products/1')
  .then(res => res.json());

// Create product
const newProduct = await fetch('http://127.0.0.1:3001/products', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'New Product',
    price: 99.99,
    category: 'Electronics',
    inStock: true
  })
}).then(res => res.json());
```

### Python

```python
import requests

# Get all products
products = requests.get('http://127.0.0.1:3001/products').json()

# Get single product
product = requests.get('http://127.0.0.1:3001/products/1').json()

# Create product
new_product = requests.post(
    'http://127.0.0.1:3001/products',
    json={
        'name': 'New Product',
        'price': 99.99,
        'category': 'Electronics',
        'inStock': True
    }
).json()
```

### curl (Command Line)

```bash
# Get all products
curl http://127.0.0.1:3001/products

# Get single product
curl http://127.0.0.1:3001/products/1

# Create product
curl -X POST http://127.0.0.1:3001/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","price":99.99,"category":"Electronics","inStock":true}'

# Update product
curl -X PUT http://127.0.0.1:3001/products/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated","price":149.99,"category":"Electronics","inStock":true}'

# Delete product
curl -X DELETE http://127.0.0.1:3001/products/1
```

---

## Stopping the Server

**Option 1:** Press `Ctrl+C` in the terminal window where the server is running.

**Option 2:** Run the stop script from the example folder:
- macOS/Linux: `./stop.sh`
- Windows: Double-click `stop.bat`

---

## Troubleshooting

### "Node.js is not installed"

1. Go to https://nodejs.org/
2. Download the **LTS** version
3. Run the installer
4. **Restart your terminal** after installation
5. Try again

### "Port already in use"

The start script automatically cleans up ports. If you still have issues:

**macOS/Linux:**
```bash
lsof -ti:3001 | xargs kill -9
lsof -ti:4010 | xargs kill -9
```

**Windows (Run as Administrator):**
```cmd
netstat -ano | findstr :3001
taskkill /PID <PID_NUMBER> /F
```

### Server starts but API returns errors

Make sure you're using the correct URL: `http://127.0.0.1:3001/products` (not just `/`)

---

## Want to Create Your Own Dataset?

See [CUSTOM_DATASET.md](./CUSTOM_DATASET.md) for instructions on creating a mock API with your own data structure.

---

## Want AI to Generate a Custom API?

See [mock_api_prompt.md](./mock_api_prompt.md) for a complete prompt template you can use with ChatGPT, Claude, or any AI assistant to generate a mock API server for your own custom dataset.

**How to use it:**
1. Open `mock_api_prompt.md`
2. Copy the prompt template
3. Fill in your dataset details (resource name, fields, sample data)
4. Paste into your preferred AI assistant
5. Save the generated files to a new folder
6. Run `./start.sh` (macOS) or `start.bat` (Windows)

---

## Security Note

This is a **local development server** for hackathon use only. It has no authentication or security features. Do not expose it to the internet or use it with real/sensitive data.

---

*Happy Hacking! 🚀*

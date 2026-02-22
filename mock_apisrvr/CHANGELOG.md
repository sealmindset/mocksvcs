# Changelog

## [1.2.0] - 2024-12-09

### Added
- **Persistent version** - New `products-api-persistent` example with real CRUD operations
  - Data saves to `db.json` and persists between requests
  - POST actually creates new items
  - PUT actually updates items
  - DELETE actually removes items
  - `POST /reset` endpoint to restore original data
- **Version selection** in Quick Start guide

---

## [1.1.0] - 2024-12-09

### Changed
- **Simplified documentation** - Removed complex setup guides in favor of one-click scripts
- **One-click start scripts** - Added `start.sh` (macOS/Linux) and `start.bat` (Windows)
- **Fixed proxy issues** - POST, PUT, DELETE now work correctly through the proxy
- **Updated to http-proxy-middleware v3** - Using new `pathFilter` and `on` event API

### Removed
- `MACOS_SETUP.md` - Replaced by one-click script
- `WINDOWS_SETUP.md` - Replaced by one-click script  
- `QUICK_START.md` - Merged into main README
- `PROMPT_TEMPLATE.md` - Simplified into CUSTOM_DATASET.md

### Fixed
- Proxy stripping request body on POST/PUT requests
- Path handling issues with http-proxy-middleware v3
- Port conflicts handled automatically by start scripts

---

## [1.0.0] - 2024-12-09

### Added
- Initial release
- Products mock API example with Swagger UI
- OpenAPI 3.0 specification
- Express server with Prism mock backend
- CORS enabled for local development
- Security comments for production guidance

---

## Project Structure

```
mockapisvr/
├── README.md              # Main documentation
├── CUSTOM_DATASET.md      # Guide for creating custom APIs
├── CHANGELOG.md           # This file
└── examples/
    └── products-api/
        ├── start.sh       # One-click start (macOS/Linux)
        ├── start.bat      # One-click start (Windows)
        ├── server.js      # Express + Swagger UI server
        ├── openapi.yaml   # API specification
        ├── package.json   # Dependencies
        └── README.md      # Example-specific docs
```

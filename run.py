#!/usr/bin/env python3
"""Start the AI Mail & Calendar Assistant."""

import uvicorn
from config.settings import settings

if __name__ == "__main__":
    print("=" * 50)
    print("  AI Mail & Calendar Assistant")
    print(f"  http://localhost:{settings.APP_PORT}")
    print("=" * 50)
    uvicorn.run(
        "app.main:app",
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        reload=True,
    )

#!/bin/bash
echo "✓ Project structure verification"
echo ""
echo "Core files:"
ls -1 src/lib/github/*.ts src/lib/db/*.ts src/lib/workers/*.ts
echo ""
echo "API routes:"
find src/app/api -name "route.ts" | sort
echo ""
echo "App pages:"
find src/app -maxdepth 2 -name "*.tsx" | grep -E "page|layout"
echo ""
echo "Configuration:"
ls -1 *.json *.ts *.js 2>/dev/null | grep -E "^(package|tsconfig|next|drizzle|tailwind|postcss|eslint)"
echo ""
echo "Documentation:"
ls -1 *.md
echo ""
echo "✓ Total TypeScript files: $(find src -name '*.ts' -o -name '*.tsx' | wc -l)"
echo "✓ Node modules: $(ls -d node_modules | wc -l) installed"

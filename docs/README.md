# Documentation

This directory contains all project documentation organized by category:

- **features/**: Feature-specific documentation and implementation guides
- **operations/**: Operational procedures, maintenance, and monitoring

## 🗄️ Database Documentation

### For Stakeholders
- **[Stakeholder Database Overview](stakeholder-database-overview.md)** - Business-friendly explanation of database structure and benefits
- **[Interactive ERD (HTML)](database-erd.html)** - Zoomable, interactive database diagram for presentations
- **[Documentation Guide](database-documentation-guide.md)** - How to use and share database documentation

### For Developers
- **[Visual ERD (SVG)](../apps/whk-recipe-configuration/prisma/ERD.svg)** - Complete database relationship diagram
- **[Technical ERD (Markdown)](../apps/whk-recipe-configuration/prisma/ERD.md)** - Version-controlled diagram in Mermaid format

### Quick Commands
```bash
# Generate all database documentation
npm run docs:generate

# Update stakeholder documentation only
npm run docs:stakeholder

# Create interactive HTML ERD
npm run docs:stakeholder:html
```

## Navigation

Each subdirectory contains its own README with specific guidance for that area.

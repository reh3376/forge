# Database Documentation for Stakeholders

## Quick Start Guide

This folder contains comprehensive database documentation designed for both technical and non-technical stakeholders.

## 📋 Available Documents

### 1. **Stakeholder Overview** - `stakeholder-database-overview.md`
- **Audience**: Business stakeholders, executives, product managers
- **Purpose**: High-level explanation of what the database stores and why
- **Contents**: Business entity explanations, data flow, compliance features
- **Best for**: Understanding business value and regulatory compliance

### 2. **Visual ERD (SVG)** - `../apps/whk-recipe-configuration/prisma/ERD.svg`
- **Audience**: Technical stakeholders, developers, architects
- **Purpose**: Complete visual representation of all database relationships
- **Contents**: All tables, relationships, and constraints
- **Best for**: Technical discussions and integration planning

### 3. **Interactive ERD (HTML)** - `database-erd.html`
- **Audience**: Mixed technical/business teams
- **Purpose**: User-friendly, zoomable database diagram
- **Contents**: Interactive SVG with zoom controls and fullscreen mode
- **Best for**: Presentations and collaborative reviews

### 4. **Technical ERD (Markdown)** - `../apps/whk-recipe-configuration/prisma/ERD.md`
- **Audience**: Developers and technical documentation
- **Purpose**: Text-based diagram for version control and documentation
- **Contents**: Mermaid diagram syntax with all entities
- **Best for**: Documentation systems and technical references

## 🔄 Keeping Documentation Current

The documentation is automatically generated from the actual database schema, ensuring it stays up-to-date.

### Regenerate All Documentation
```bash
npm run docs:generate
```

### Update Just the ERD
```bash
npm run docs:erd
```

### Update Just the Stakeholder Docs
```bash
npm run docs:stakeholder
```

### Create Interactive HTML Version
```bash
npm run docs:stakeholder:html
```

## 🎯 Sharing with Stakeholders

### For Business Meetings
1. **Start with**: `stakeholder-database-overview.md` - provides business context
2. **Follow with**: `database-erd.html` - visual walkthrough of data relationships
3. **Reference**: Specific sections based on stakeholder interests

### For Technical Reviews
1. **Use**: `ERD.svg` - complete technical diagram
2. **Supplement with**: `stakeholder-database-overview.md` for business context
3. **Reference**: `ERD.md` for detailed technical specifications

### For Executive Presentations
1. **Focus on**: Business benefits section in stakeholder overview
2. **Show**: High-level data flow and compliance features
3. **Avoid**: Technical implementation details

## 📱 Presentation Tips

### Using the Interactive HTML ERD
- **Zoom**: Use zoom controls for detailed sections
- **Fullscreen**: Great for large screen presentations
- **Navigation**: Scroll to focus on specific areas of interest

### Key Areas to Highlight
- **Recipe Management**: Core business value proposition
- **Traceability**: Regulatory compliance and quality assurance
- **Production Flow**: Operational efficiency features
- **Quality Control**: Risk management and brand protection

## 🔧 Customization

### Adding Business Context
Edit `stakeholder-database-overview.md` to include:
- Recent business achievements using the data
- Specific regulatory compliance examples
- ROI calculations from data-driven decisions

### Updating Visual Style
Modify `scripts/generate-stakeholder-docs.js` to:
- Change HTML template styling
- Add company branding
- Customize zoom and navigation controls

## 📞 Support

For questions about:
- **Business Content**: Contact operations or quality teams
- **Technical Details**: Contact development team
- **Compliance**: Contact regulatory affairs team

---

*This documentation is automatically maintained. Last updated: [Auto-generated]* 
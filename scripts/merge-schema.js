const fs = require('fs');
const path = require('path');

const SCHEMA_DIR = path.join(__dirname, '../prisma/schema');
const OUTPUT_FILE = path.join(SCHEMA_DIR, 'merged.prisma');

function mergeSchemaFiles() {
    console.log('🔄 Merging Prisma schema files...');
    
    // Read the main schema file (contains generator and datasource)
    const mainSchemaPath = path.join(SCHEMA_DIR, 'schema.prisma');
    let mergedContent = fs.readFileSync(mainSchemaPath, 'utf8');
    
    // Add a separator
    mergedContent += '\n\n// ========================================\n';
    mergedContent += '// MERGED SCHEMA FILES\n';
    mergedContent += '// ========================================\n\n';
    
    // Get all .prisma files except the main schema and merged file
    const schemaFiles = fs.readdirSync(SCHEMA_DIR)
        .filter(file => 
            file.endsWith('.prisma') && 
            file !== 'schema.prisma' && 
            file !== 'merged.prisma'
        )
        .sort(); // Sort for consistent ordering
    
    // Merge each schema file
    schemaFiles.forEach(file => {
        const filePath = path.join(SCHEMA_DIR, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Add file header comment
        mergedContent += `// ========================================\n`;
        mergedContent += `// FROM: ${file}\n`;
        mergedContent += `// ========================================\n\n`;
        
        // Add the content (skip any generator/datasource blocks in individual files)
        const cleanContent = content
            .replace(/generator\s+\w+\s*{[^}]*}/gs, '') // Remove generator blocks
            .replace(/datasource\s+\w+\s*{[^}]*}/gs, '') // Remove datasource blocks
            .replace(/^\/\/.*$/gm, '') // Remove single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
            .trim();
        
        if (cleanContent) {
            mergedContent += cleanContent + '\n\n';
        }
    });
    
    // Write the merged schema
    fs.writeFileSync(OUTPUT_FILE, mergedContent);
    
    console.log(`✅ Schema files merged successfully!`);
    console.log(`📁 Output: ${OUTPUT_FILE}`);
    console.log(`📋 Merged files: ${schemaFiles.join(', ')}`);
}

// Run the merger
try {
    mergeSchemaFiles();
} catch (error) {
    console.error('❌ Error merging schema files:', error.message);
    process.exit(1);
}
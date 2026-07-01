const fs = require('fs');
const path = require('path');

const srcDirs = [
    path.join(__dirname, '../models'),
    path.join(__dirname, '../controllers'),
    path.join(__dirname, '../routes'),
    path.join(__dirname, '../utils'),
    path.join(__dirname, '../'), // root basically
];

// 1. Get exports
const allExports = [];

const parseExports = (filePath, content) => {
    const filename = path.basename(filePath);
    const match = content.match(/module\.exports\s*=\s*\{([^}]+)\}/);
    if (match) {
        const exportsList = match[1].split(',').map(s => s.trim().replace(/\n/g, '')).filter(s => s);
        for (let exp of exportsList) {
             let name = exp.split(':')[0].trim();
             if (name) {
                 allExports.push({ file: filename, path: filePath, name });
             }
        }
    } else {
        const lines = content.split('\n');
        for (const line of lines) {
             const m = line.match(/module\.exports\s*=\s*\{\s*([^}]+)\s*\}/);
             if (m) {
                 allExports.push({ file: filename, path: filePath, name: m[1].trim() });
             }
        }
    }
};

const file1 = path.join(__dirname, '../models/clientes/almacenamiento.js');
if (fs.existsSync(file1)) parseExports(file1, fs.readFileSync(file1, 'utf8'));

const file2 = path.join(__dirname, '../models/clients.js');
if (fs.existsSync(file2)) parseExports(file2, fs.readFileSync(file2, 'utf8'));

// 2. Search codebase
const searchFiles = (dir, fileList = []) => {
    if (!fs.existsSync(dir)) return fileList;
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            searchFiles(fullPath, fileList);
        } else if (fullPath.endsWith('.js')) {
            fileList.push(fullPath);
        }
    }
    return fileList;
};

const allJsFiles = [];
for (const dir of srcDirs) {
    searchFiles(dir, allJsFiles);
}
allJsFiles.push(path.join(__dirname, '../app.js'));

const usageCounts = {};
for (const exp of allExports) {
    usageCounts[exp.name] = 0;
}

for (const jsFile of allJsFiles) {
    if (!fs.existsSync(jsFile)) continue;
    const content = fs.readFileSync(jsFile, 'utf8');
    for (const exp of allExports) {
        // Count occurrences of the word
        const regex = new RegExp(`\\b${exp.name}\\b`, 'g');
        const matches = content.match(regex);
        if (matches) {
            // we have to be careful if it's just the export definition itself
            // if the file is the file that exports it, we expect at least 1 match for definition and 1 for export
            // let's just count total occurrences
            let count = matches.length;
            // if it's the defining file, subtract the export definition and the function declaration
            if (jsFile === exp.path) {
                 // Usually it's declared once (function name) and exported once
                 count -= 2;
            }
            if (count > 0) {
                 usageCounts[exp.name] += count;
            }
        }
    }
}

const unused = allExports.filter(exp => usageCounts[exp.name] === 0);

console.log("TOTAL EXPORTS:", allExports.length);
console.log("UNUSED EXPORTS:");
for (const u of unused) {
    console.log(`- ${u.name} (in ${u.file})`);
}

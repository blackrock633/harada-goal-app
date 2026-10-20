const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/domain');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));

for (const f of files) {
  const p = path.join(dir, f);
  let content = fs.readFileSync(p, 'utf-8');
  
  content = content.replace(/import \{([^}]+)\} from '\.\/types\.js';/g, (match, p1) => {
    const imports = p1.split(',').map(s => s.trim());
    const typeImports = [];
    const errorImports = [];
    const limitImports = [];
    
    for (const i of imports) {
      if (['DomainError', 'isDomainError'].includes(i)) errorImports.push(i);
      else if (['LIMITS', 'MAX_OUTCOMES_PER_GOAL', 'MAX_ACTIONS_PER_OUTCOME', 'ADHERENCE_WINDOW_DAYS'].includes(i)) limitImports.push(i);
      else typeImports.push(i);
    }
    
    let res = '';
    if (typeImports.length) res += `import { ${typeImports.join(', ')} } from './types.js';\n`;
    if (errorImports.length) res += `import { ${errorImports.join(', ')} } from './errors.js';\n`;
    if (limitImports.length) res += `import { ${limitImports.join(', ')} } from './limits.js';\n`;
    return res;
  });
  
  fs.writeFileSync(p, content);
}

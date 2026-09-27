import fs from 'fs';
import * as ts from 'typescript';

function isDivLike(tagName: string): boolean {
  return tagName === 'div' || tagName === 'motion.div';
}

function getTagName(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string {
  return node.tagName.getText();
}

interface ElementInfo {
  tag: string;
  line: number;
  snippet: string;
  children: ElementInfo[];
}

function parseJsx(node: ts.Node, sourceFile: ts.SourceFile): ElementInfo[] {
  const result: ElementInfo[] = [];

  function visit(n: ts.Node): ElementInfo[] {
    const list: ElementInfo[] = [];

    if (ts.isJsxElement(n)) {
      const tag = getTagName(n.openingElement);
      const { line } = sourceFile.getLineAndCharacterOfPosition(n.getStart());
      const childElements: ElementInfo[] = [];
      for (const child of n.children) {
        childElements.push(...visit(child));
      }
      list.push({
        tag,
        line: line + 1,
        snippet: n.getText().slice(0, 120).replace(/\s+/g, ' '),
        children: childElements,
      });
      return list;
    } else if (ts.isJsxSelfClosingElement(n)) {
      const tag = getTagName(n);
      const { line } = sourceFile.getLineAndCharacterOfPosition(n.getStart());
      list.push({
        tag,
        line: line + 1,
        snippet: n.getText().slice(0, 120).replace(/\s+/g, ' '),
        children: [],
      });
      return list;
    } else if (ts.isJsxExpression(n)) {
      if (n.expression) {
        list.push(...visit(n.expression));
      }
      return list;
    } else if (ts.isConditionalExpression(n)) {
      list.push(...visit(n.whenTrue));
      list.push(...visit(n.whenFalse));
      return list;
    } else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      list.push(...visit(n.right));
      return list;
    } else if (ts.isParenthesizedExpression(n)) {
      list.push(...visit(n.expression));
      return list;
    } else {
      ts.forEachChild(n, c => {
        list.push(...visit(c));
      });
      return list;
    }
  }

  return visit(node);
}

function searchFile(filePath: string) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const sf = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const elements = parseJsx(sf, sf);
  
  // Find all <main> elements
  function findMains(el: ElementInfo, ancestors: ElementInfo[] = []): Array<{ main: ElementInfo, ancestors: ElementInfo[] }> {
    const mains: Array<{ main: ElementInfo, ancestors: ElementInfo[] }> = [];
    if (el.tag === 'main') {
      mains.push({ main: el, ancestors });
    }
    for (const ch of el.children) {
      mains.push(...findMains(ch, [...ancestors, el]));
    }
    return mains;
  }

  for (const rootEl of elements) {
    const mains = findMains(rootEl);
    for (const { main, ancestors } of mains) {
      console.log(`\nFound <main> in ${filePath} at line ${main.line}`);
      console.log('Ancestors count:', ancestors.length, ancestors.map(a => a.tag).join(' > '));
      
      // Now trace from main:
      // main > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(3)
      const divChildren = main.children.filter(c => isDivLike(c.tag));
      console.log(`  main has ${divChildren.length} div children`);
      
      divChildren.forEach((d1, i1) => {
        console.log(`  div[${i1+1}] (line ${d1.line}): ${d1.snippet.slice(0, 60)}`);
        const d1Children = d1.children.filter(c => isDivLike(c.tag));
        d1Children.forEach((d2, i2) => {
          console.log(`    div[${i1+1}] > div[${i2+1}] (line ${d2.line}): ${d2.snippet.slice(0, 60)}`);
          const d2Children = d2.children.filter(c => isDivLike(c.tag));
          d2Children.forEach((d3, i3) => {
            console.log(`      div[${i1+1}] > div[${i2+1}] > div[${i3+1}] (line ${d3.line}): ${d3.snippet.slice(0, 60)}`);
            const d3Children = d3.children.filter(c => isDivLike(c.tag));
            d3Children.forEach((d4, i4) => {
              if (i1 === 0 && i2 === 0 && i3 === 1 && i4 === 2) {
                console.log(`\n>>> EXACT MATCH: div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(3)`);
                console.log(`>>> Line: ${d4.line}`);
                console.log(`>>> Snippet: ${d4.snippet}\n`);
              }
            });
          });
        });
      });
    }
  }
}

searchFile('src/components/AdminPanel.tsx');
searchFile('src/components/Dashboard.tsx');
searchFile('src/components/TiendaGeneral.tsx');

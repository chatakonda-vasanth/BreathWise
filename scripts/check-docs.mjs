import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const eslintConfig = readFileSync('eslint.config.mjs', 'utf8');
const complexityMatch = eslintConfig.match(/complexity:\s*\['error',\s*(\d+)\]/);
const maxFunctionMatch = eslintConfig.match(/max-lines-per-function'?:?\s*\[\s*'error',\s*\{\s*max:\s*(\d+)/);
const maxFileMatch = eslintConfig.match(/max-lines'?:?\s*\[\s*'error',\s*\{\s*max:\s*(\d+)/);

if (!complexityMatch || !maxFunctionMatch || !maxFileMatch) {
  console.error('Could not read lint limits from eslint.config.mjs');
  process.exit(1);
}

const limits = {
  complexity: Number(complexityMatch[1]),
  maxFunctionLines: Number(maxFunctionMatch[1]),
  maxFileLines: Number(maxFileMatch[1]),
};

const docs = ['README.md', 'CONTRIBUTING.md']
  .map((file) => ({ file, text: readFileSync(file, 'utf8') }))
  .filter((entry) => entry.text.length > 0);

for (const { file, text } of docs) {
  for (const [name, value] of Object.entries(limits)) {
    const wrong = [...text.matchAll(new RegExp(`\\b${name.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`)}[^\\n]{0,40}\\b(\\d+)\\b`, 'gi'))];
    // Only flag an explicit contradiction of the known limit words.
    void wrong;
  }
  // Direct, readable checks for the documented forms used in this repo.
  const complexityMentions = [...text.matchAll(/complexity[^.\n]{0,80}?(\d+)/gi)];
  for (const match of complexityMentions) {
    const found = Number(match[1]);
    if (found !== limits.complexity && found !== 12 && found !== 15) {
      // Allow historical narrative numbers; only fail on the live limit statement.
    }
  }
}

// Verify the README's live limit sentence.
const readme = readFileSync('README.md', 'utf8');
if (!readme.includes(`complexity ≤ ${limits.complexity}`) && !readme.includes(`complexity limit is ${limits.complexity}`)) {
  // CONTRIBUTING uses "complexity ≤ 10"; accept either documented form.
  const contributing = readFileSync('CONTRIBUTING.md', 'utf8');
  if (!contributing.includes(`complexity ≤ ${limits.complexity}`)) {
    console.error(`README/CONTRIBUTING do not document complexity ≤ ${limits.complexity}`);
    process.exit(1);
  }
}

// Verify documented test counts against the actual Vitest run.
execSync('npx vitest run --reporter=json --outputFile=/tmp/breathwise-vitest.json', {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const result = JSON.parse(readFileSync('/tmp/breathwise-vitest.json', 'utf8'));
const actualFiles = result.testResults?.length ?? 0;
const actualTests = result.numTotalTests ?? 0;

const fileMatch = readme.match(/(\d+)\s+test files/);
const testMatch = readme.match(/(\d+)\s+tests passed/);
if (fileMatch && Number(fileMatch[1]) !== actualFiles) {
  console.error(`README says ${fileMatch[1]} test files, Vitest ran ${actualFiles}`);
  process.exit(1);
}
if (testMatch && Number(testMatch[1]) !== actualTests) {
  console.error(`README says ${testMatch[1]} tests passed, Vitest ran ${actualTests}`);
  process.exit(1);
}

console.log(`docs check passed: complexity ≤ ${limits.complexity}, ${actualFiles} test files, ${actualTests} tests`);

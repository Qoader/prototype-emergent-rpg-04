const major = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);

if (major !== 24) {
  console.error(`This project requires Node 24 (found ${process.version}). Use the version in .node-version.`);
  process.exitCode = 1;
}

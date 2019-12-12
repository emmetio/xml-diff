# Diff XML documents

The goal of this module is to calculate diff between *text content* of two XML or HTML documents, preserving its tag structure:

```js
import diff from '@emmetio/xml-diff';

const from = `<doc>
    <p>Lorem ipsum dolor sit amet <em>consectetur, adipisicing</em> elit.</p>
</doc>`;
const to = `<doc>
    <p>Lorem ipsum dolor sit amet aspernatur, <strong>doloribus</strong> in libero.</p>
</doc>`;

const result = diff(from, to);
console.log(result);
/*
<doc>
    <p>Lorem ipsum dolor sit amet <del>consectetur, adipisicing elit</del><ins>aspernatur, </ins><strong><ins>doloribus</ins></strong><ins> in libero</ins>.</p>
</doc>
*/
```

---
> Project development is sponsored by [Xcential Corporation](https://xcential.com)
---

## Features
* **High performance**: uses [small and fast XML scanner](https://github.com/emmetio/html-matcher), written in pure JavaScript.
* **Supports multiple dialects**: able to parse invalid HTML, even JSX and Angular templates.
* **Works everywhere**: doesn’t use browser DOM or APIs, runs in any browser, Node.JS and WebWorkers.

## Installation & usage

Install it as regular npm module:

```
npm install @emmetio/xml-diff
```

This module exposes main `diff(from, to)` function which accepts two text documents and returns patched `to` document with updates marked with `<ins>` and `<del>` tags.

## How it works

* Takes XML document and strips all markup data from it (tags, comments, CDATA etc.), leaving plain text content: `<div>Hello <b>world</b>!</div>` → `Hello world!`.
* Collapses and reduces insignificant white space characters like new lines, tabs and so on into a single space to reduce noise when comparing formatted documents.
* Performs diff with Google’s [Diff Match Patch](https://github.com/google/diff-match-patch) library.
* Applies patches to second document’s (`to`) plain content.
* Restores markup and whitespace data of original document

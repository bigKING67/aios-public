import ts from 'typescript';
import { readTextFile } from '../shared/guard-utils.mjs';

export function parseTsxFile(filePath) {
  const sourceText = readTextFile(filePath);
  return {
    sourceText,
    sourceFile: ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
  };
}

export function normalizeTypeText(typeText) {
  return typeText.replace(/\s+/g, ' ').trim();
}

export function getInterfaceProperties(sourceFile, interfaceName) {
  const interfaceNode = findNode(sourceFile, (node) => (
    ts.isInterfaceDeclaration(node) && node.name.text === interfaceName
  ));

  if (!interfaceNode) {
    return null;
  }

  return interfaceNode.members.map((member) => {
    if (!ts.isPropertySignature(member) || !ts.isIdentifier(member.name) || !member.type) {
      return null;
    }

    return {
      name: member.name.text,
      type: normalizeTypeText(member.type.getText(sourceFile)),
    };
  });
}

export function getFunctionParameterType(sourceFile, functionName) {
  const functionNode = findNode(sourceFile, (node) => (
    ts.isFunctionDeclaration(node) && node.name?.text === functionName
  ));

  const [firstParameter] = functionNode?.parameters || [];
  if (!firstParameter?.type) {
    return null;
  }

  return normalizeTypeText(firstParameter.type.getText(sourceFile));
}

export function hasFunctionObjectParameterBinding(sourceFile, functionName, bindingName) {
  return Boolean(findNode(sourceFile, (node) => {
    if (!ts.isFunctionDeclaration(node) || node.name?.text !== functionName) {
      return false;
    }

    const [firstParameter] = node.parameters;
    if (!firstParameter || !ts.isObjectBindingPattern(firstParameter.name)) {
      return false;
    }

    return firstParameter.name.elements.some((element) => (
      getBindingElementName(element) === bindingName
    ));
  }));
}

export function hasLocalTypeDeclaration(sourceFile, typeName) {
  return Boolean(findNode(sourceFile, (node) => (
    (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
    node.name.text === typeName
  )));
}

export function hasIdentifier(sourceFile, identifierName) {
  return Boolean(findNode(sourceFile, (node) => (
    ts.isIdentifier(node) && node.text === identifierName
  )));
}

export function hasObjectLiteralProperty(sourceFile, propertyName) {
  return Boolean(findNode(sourceFile, (node) => {
    if (!node.parent || !ts.isObjectLiteralExpression(node.parent)) {
      return false;
    }
    if (
      (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) &&
      getPropertyNameText(node.name) === propertyName
    ) {
      return true;
    }

    return ts.isShorthandPropertyAssignment(node) && node.name.text === propertyName;
  }));
}

export function hasImportSource(sourceFile, sourceNeedle) {
  return Boolean(findNode(sourceFile, (node) => (
    ts.isImportDeclaration(node) &&
    ts.isStringLiteral(node.moduleSpecifier) &&
    node.moduleSpecifier.text.includes(sourceNeedle)
  )));
}

export function hasNamedImport(sourceFile, {
  sourceNeedle,
  importedName,
  localName,
}) {
  return Boolean(findNode(sourceFile, (node) => {
    if (
      !ts.isImportDeclaration(node) ||
      !ts.isStringLiteral(node.moduleSpecifier) ||
      !node.moduleSpecifier.text.includes(sourceNeedle) ||
      !node.importClause?.namedBindings ||
      !ts.isNamedImports(node.importClause.namedBindings)
    ) {
      return false;
    }

    return node.importClause.namedBindings.elements.some((element) => {
      const actualImportedName = element.propertyName?.text ?? element.name.text;
      const actualLocalName = element.name.text;
      return (
        (!importedName || actualImportedName === importedName) &&
        (!localName || actualLocalName === localName)
      );
    });
  }));
}

export function countCallExpressions(sourceFile, expressionText) {
  return countNodes(sourceFile, (node) => (
    ts.isCallExpression(node) &&
    normalizeTypeText(node.expression.getText(sourceFile)) === expressionText
  ));
}

export function hasPropertyAccessExpression(sourceFile, expressionText) {
  return Boolean(findNode(sourceFile, (node) => (
    ts.isPropertyAccessExpression(node) &&
    normalizeTypeText(node.getText(sourceFile)) === expressionText
  )));
}

export function hasJsxElement(sourceFile, tagName) {
  return Boolean(findNode(sourceFile, (node) => (
    (ts.isJsxElement(node) && getJsxTagName(node.openingElement.tagName) === tagName) ||
    (ts.isJsxSelfClosingElement(node) && getJsxTagName(node.tagName) === tagName)
  )));
}

export function hasJsxElementWithExpressionChild(sourceFile, {
  tagName,
  expressionText,
}) {
  return Boolean(findNode(sourceFile, (node) => {
    if (!ts.isJsxElement(node) || getJsxTagName(node.openingElement.tagName) !== tagName) {
      return false;
    }

    return node.children.some((child) => (
      ts.isJsxExpression(child) &&
      child.expression &&
      normalizeTypeText(child.expression.getText(sourceFile)) === expressionText
    ));
  }));
}

export function hasJsxElementWithSpread(sourceFile, {
  tagName,
  spreadName,
  typeArguments = [],
}) {
  return Boolean(findNode(sourceFile, (node) => {
    if (!isJsxOpeningLikeElement(node) || getJsxTagName(node.tagName) !== tagName) {
      return false;
    }

    const actualTypeArguments = (node.typeArguments || [])
      .map((typeArgument) => normalizeTypeText(typeArgument.getText(sourceFile)));
    if (actualTypeArguments.join('|') !== typeArguments.join('|')) {
      return false;
    }

    return node.attributes.properties.some((attribute) => (
      ts.isJsxSpreadAttribute(attribute) &&
      normalizeTypeText(attribute.expression.getText(sourceFile)) === spreadName
    ));
  }));
}

export function hasJsxElementWithAttribute(sourceFile, {
  tagName,
  attributeName,
  expressionText,
}) {
  return Boolean(findNode(sourceFile, (node) => {
    if (!isJsxOpeningLikeElement(node) || getJsxTagName(node.tagName) !== tagName) {
      return false;
    }

    return node.attributes.properties.some((attribute) => {
      if (!ts.isJsxAttribute(attribute) || attribute.name.text !== attributeName) {
        return false;
      }
      if (expressionText === undefined) {
        return true;
      }

      return normalizeJsxAttributeInitializer(sourceFile, attribute.initializer) === expressionText;
    });
  }));
}

export function hasJsxAttribute(sourceFile, attributeName) {
  return Boolean(findNode(sourceFile, (node) => (
    ts.isJsxAttribute(node) && node.name.text === attributeName
  )));
}

function findNode(root, predicate) {
  let match = null;

  function visit(node) {
    if (match) {
      return;
    }
    if (predicate(node)) {
      match = node;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(root);
  return match;
}

function countNodes(root, predicate) {
  let count = 0;

  function visit(node) {
    if (predicate(node)) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  }

  visit(root);
  return count;
}

function isJsxOpeningLikeElement(node) {
  return ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node);
}

function getJsxTagName(tagNameNode) {
  if (ts.isIdentifier(tagNameNode)) {
    return tagNameNode.text;
  }

  return tagNameNode.getText();
}

function getBindingElementName(element) {
  if (element.propertyName && ts.isIdentifier(element.propertyName)) {
    return element.propertyName.text;
  }
  if (ts.isIdentifier(element.name)) {
    return element.name.text;
  }
  return null;
}

function getPropertyNameText(name) {
  if (!name) {
    return null;
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function normalizeJsxAttributeInitializer(sourceFile, initializer) {
  if (!initializer) {
    return '';
  }
  if (ts.isStringLiteral(initializer)) {
    return initializer.text;
  }
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    return normalizeTypeText(initializer.expression.getText(sourceFile));
  }

  return normalizeTypeText(initializer.getText(sourceFile));
}

import ts from 'typescript';

import type { IRContext } from '../../../ir/context';
import { digitsRegExp } from '../../../utils/regexp';
import { stringCase } from '../../../utils/stringCase';

/**
 * Returns final field name for object properties. This might differ from the
 * original value as applying case transform function might alter it.
 */
export const fieldName = ({
  context,
  name,
}: {
  context: IRContext;
  name: string;
}) => {
  digitsRegExp.lastIndex = 0;
  if (digitsRegExp.test(name)) {
    return ts.factory.createNumericLiteral(name);
  }

  // if (typeof context.config.output.case === 'function') {
  //   return context.config.output.case({ value: name });
  // }

  return stringCase({ case: context.config.output.case, value: name });
};

'use strict';
const { z } = require('zod');

/** Valida req.body / req.params / req.query com schemas Zod (whitelist de campos e tipos). */
function validate(schemas) {
  return (req, res, next) => {
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (!result.success) {
        return res.status(400).json({
          error: 'Dados inválidos',
          details: result.error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
        });
      }
      if (part === 'query') req.validQuery = result.data;
      else req[part] = result.data;
    }
    next();
  };
}

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'ID inválido');
const idParam = z.object({ id: objectId });

// Senha forte: 8+ caracteres com letra e número
const password = z
  .string()
  .min(8, 'Mínimo de 8 caracteres')
  .max(128)
  .regex(/[A-Za-z]/, 'Deve conter letra')
  .regex(/\d/, 'Deve conter número');

module.exports = { validate, z, objectId, idParam, password };

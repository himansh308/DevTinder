const validate = (schemas) => (req, res, next) => {
    for (const part of ["params", "query", "body"]) {
        const schema = schemas[part];
        if (!schema) continue;

        const result = schema.safeParse(req[part] ?? {});
        if (!result.success) {
            return res.status(400).send(result.error.issues[0].message);
        }
        if (part === "body") {
            req.body = result.data;
        }
    }
    next();
};

module.exports = { validate };

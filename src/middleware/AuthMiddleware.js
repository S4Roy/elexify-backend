const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = {
    checkAuth: function (req, resp, next) {
        let data = {};
        try {
            const token = req.headers['x-access-token'];
            if (!token) {
                return resp.status(401).send({ 'status': "unauthenticated", 'message': "Authorization token not provided", data: data });
            }

            jwt.verify(token, process.env.JWT_TOKEN, async function (err, decoded) {
                if (err) {
                    return resp.status(401).send({ 'status': "unauthenticated", 'message': 'Unauthentication Action : ' + (err ? err.message : 'UNTRACABLE'), data: data });
                }

                req.auth = {};
                req.auth.id = decoded.user_id;
                req.auth.data = decoded;

                await User.findOne({ _id: req.auth.id }, '',).exec().then(function (user) {
                    req.auth.data = user;
                }).catch((err) => {
                    return resp.status(401).send({ status: 'unauthenticated', message: err?.message ?? "DB Error Occured", data: data });
                })

                if (!req.auth.data) {
                    return resp.status(401).send({ status: 'unauthenticated', message: 'Session Expired!! Please signin again to continue', data: data });
                }

                if (req.auth.data.status != 'active') {
                    return resp.status(401).send({ status: 'unauthenticated', message: 'Your account has been blocked. Please contact our support team for further assistance', data: data });
                }

                if (req.auth.data.deleted_at != null) {
                    return resp.status(401).send({ status: 'unauthenticated', message: 'Your account has been removed. Please contact our support team for further assistance', data: data });
                }

                next();
            });
        } catch (e) {
            return resp.status(200).send({ status: 'error', message: e ? e.message : 'Something went wrong', data: data });
        }
    },

    checkRole(accepted_role) {
        return function (req, resp, next) {
            let data = {};
            try {
                const token = req.headers['x-access-token'];
                if (!token) {
                    return resp.status(401).send({ 'status': "unauthenticated", 'message': "Authorization token not provided", data: data });
                }

                jwt.verify(token, process.env.JWT_TOKEN, async function (err, decoded) {
                    if (err) {
                        return resp.status(401).send({ 'status': "unauthenticated", 'message': 'Unauthentication Action : ' + (err ? err.message : 'UNTRACABLE'), data: data });
                    }

                    let user = null;
                    await User.findOne({ _id: req.auth.id }, '',).exec().then(function (details) {
                        return user = details;
                    }).catch((err) => {
                        return resp.status(401).send({ status: 'unauthenticated', message: err?.message ?? "DB Error Occured", data: data });
                    })

                    if (!user) {
                        return resp.status(401).send({ status: 'unauthenticated', message: 'Session Expired!! Please signin again to continue', data: data });
                    }

                    if (Array.isArray(accepted_role) && accepted_role.includes(user.role)) {
                        next();
                    } else if (accepted_role == user.role) {
                        next();
                    } else {
                        return resp.status(200).send({ status: 'error', message: 'Oops!! Permission denied', data: data });
                    }
                })
            } catch (e) {
                return resp.status(200).send({ status: 'error', message: e ? e.message : 'Something went wrong', data: data });
            }
        }
    },
}
//Configurations
const config = require('../etc/config.json');

//Errors handling
var Errors = require("../modules/errors-handling");
var errors = new Errors();


//Web server
var express = require('express');
var app = express();
var router = express.Router();

//MongoDB
var DB = require("../modules/db");
var mdb = new DB(config.mongo.url);
var mongo_instance = config.mongo.instance

//logging
const log = require('log-to-file');
const app_log = config.maics.log_dir+"app.log"

//Authenticator
var speakeasy = require("speakeasy");
var QRCode = require('qrcode');

//UFA
const u2f = require("u2f");
const APP_ID = config.maics.url;


router.get('/management', function (req, res, next) {
        var err = ''
        err += req.query.error;
        mdb.connect(mongo_instance)
            .then(
                function () {
                    mdb.findDocument("users", { email: req.session.email })
                        .then(
                            function (value) {
                                //parse enabled methods
                                // check token enroll status
                                var otp_unenrolled = false;
                                var token_unenrolled = false;
                                if (value.otp_secret == "" && value.otp_enabled)
                                    otp_unenrolled = true;
                                if (value.token_publicKey == "" && value.token_enabled)
                                    token_unenrolled = true

                                if (value.token_keyHandle)
                                    req.session.u2f = u2f.request(APP_ID, value.token_keyHandle);

                                res.render('keys-management', {
                                    name: value.name,
                                    surname: value.surname,
                                    username: req.session.email,
                                    sys_username: value.sys_username,
                                    role: value.role,
                                    groups: value.group,
                                    sshPublicKey: value.sshPublicKey,
                                    sign_challenge: JSON.stringify(req.session.u2f),
                                    otp_verified: req.session.otp_verified,
                                    otp_enabled: value.otp_enabled,
                                    otp_unenrolled: otp_unenrolled,
                                    token_verified: req.session.token_verified,
                                    token_enabled: value.token_enabled,
                                    token_unenrolled: token_unenrolled,
                                    key_lock: req.session.key_lock,
                                    url: config.maics.url,
                                    code: req.query.code,
                                    error: err
                                });
                            },
                            function(err){ errors.mdb_query_error(res,err); }
                        );
                },
                function (err) { errors.mdb_connection_refused(res, err)}
            );
});

router.get('/2fa', function(req, res, next) {
        mdb.connect(mongo_instance)
        .then(
            function() {
                mdb.findDocument("users", {email: req.session.email})
                .then(
                    function(value){
                        var secret = speakeasy.generateSecret({length: 32});
                        QRCode.toDataURL(secret.otpauth_url.replace("SecretKey", req.session.email), function(err, image_data) {
                            //check if one of MFA is set
                            if(value.otp_secret=="")
                                otp_secret = secret.base32;
                            else
                                otp_secret = "true";
                            if(value.token_publicKey=="")
                                challenge = JSON.stringify(req.session.u2f)
                            else
                                challenge = "true";

                            console.log(challenge);

                            res.render('keys-2fa', {
                                sys_username: value.sys_username,
                                username: req.session.email,
                                role: req.session.role,
                                otp_secret: otp_secret,
                                otp_qr: image_data,
                                token_challenge: challenge,
                                token_enabled: value.token_enabled,
                                otp_enabled: value.otp_enabled,
                                url: config.maics.url,
                                error: req.query.error
                            });
                        });
                    },
                    function(err){ errors.mdb_query_error(res,err); }
                );
            },
            function (err) { errors.mdb_connection_refused(res, err)}
        )
});


module.exports = router;

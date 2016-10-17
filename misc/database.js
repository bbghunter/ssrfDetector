var bcrypt = require('bcryptjs'),
	crypto = require('crypto')
Q = require('q');
//config = require('./config.js'), //config file contains all tokens and other private info

//used in local-signup strategy
exports.localReg = function (req, email, password) {
	var deferred = Q.defer();
	var passwordConfirm = req.body.passwordConfirm;
	var hash = bcrypt.hashSync(password, 8);
	crypto.randomBytes(36, function (err, buffer) {
		confirmationLink = buffer.toString('hex');
		var user = {
			"password": hash,
			"email": email,
			"confirmationLink": confirmationLink
		}
		var users = req.app.get("db").collection('users');
		//check if email is already assigned in our database
		users.find({
			email: email
		}).toArray(function (err, docs) {
			if (err != null) {
				console.log('Error: ' + err.body);
				deferred.reject(err.body); //email already exists
			}
			if (docs.length != 0) {
				console.log('email already exists');
				deferred.reject("Email already taken"); //email already exists
			} else {
				console.log('Email is free for use');
				if (password != passwordConfirm) {
					deferred.reject("Passwords do not match");
				} else {
					users.insertOne(user, function (err, result) {
						if (err === null) {
							user.confirmationLink = confirmationLink;
							deferred.resolve(user);
						} else {
							console.log("PUT FAIL:" + err.body);
							deferred.reject("Error saving user details, please try again");
						}
					});
				}
			}
		})
	})
	return deferred.promise;
};

//check if user exists
//if user exists check if passwords match (use bcrypt.compareSync(password, hash); // true where 'hash' is password in DB)
//if password matches take into website
//if user doesn't exist or password doesn't match tell them it failed
exports.localAuth = function (req, email, password) {
	var deferred = Q.defer();
	var db = req.app.get("db").collection('users');
	db.find({
		'email': email
	}).toArray(function (err, docs) {
		if (err != null) {
			console.log("Error: " + err.body);
			deferred.reject(err.body);
		} else if (docs.length === 0) {
			console.log("Error: User doesn't exist");
			deferred.reject("Incorrect email or password");
		} else {
			var hash = docs[0].password;
			if (bcrypt.compareSync(password, hash)) {
				if (docs[0].confirmationLink != null) {
					deferred.reject("Please check your email and confirm your account");
				} else {
					deferred.resolve(docs[0]);
				}
			} else {
				console.log("PASSWORDS NOT MATCH");
				deferred.reject("Incorrect email or password");
			}
		}
	})

	return deferred.promise;
}

exports.setResetLink = function (req) {
	var deferred = Q.defer();
	var resetLink;
	var db = req.app.get("db").collection('users');
	var email = req.body.email;
	db.find({
		'email': req.body.email
	}).toArray(function (err, docs) {
		if (err != null) {
			console.log("Error: " + err.body);
			deferred.reject(err.body);
		} else if (docs.length === 0) {
			console.log("Error: User doesn't exist");
			deferred.reject(false);
		} else {
			crypto.randomBytes(36, function (err, buffer) {
				resetLink = buffer.toString('hex');
				db.updateOne({
					email: email
				}, {
					$set: {
						resetLink: resetLink
					}
				}, function (err, result) {
					if (err === null) {
						deferred.resolve({
							email: email,
							resetLink: resetLink
						});
					} else {
						console.log("Reset link FAIL:" + err.body);
						deferred.reject(new Error(err.body));
					}
				});
			})
		}
	})

	return deferred.promise;
}

exports.getResetLink = function (req) {
	var deferred = Q.defer();
	var db = req.app.get("db").collection('users');
	var resetLink = req.params.resetLink;
	db.find({
		'resetLink': resetLink
	}).toArray(function (err, docs) {
		if (err != null) {
			console.log("Error: " + err.body);
			deferred.reject(err.body);
		} else if (docs.length === 0) {
			console.log('doc length: ' + docs.length);
			console.log("Error: Expired or non-existent link");
			deferred.reject("Expired or non-existent link.");
		} else {
			deferred.resolve(resetLink);
		}
	})

	return deferred.promise;
}


exports.registerDomain = function (req) {
	var deferred = Q.defer();
	var db = req.app.get("db").collection('users');
	var domain = req.body.domain;
	db.find({
		'domain': domain
	}).toArray(function (err, docs) {
		if (err != null) {
			console.log("Error: " + err.body);
			deferred.reject(err.body);
		} else if (docs.length === 0) {
			console.log('setting ' + req.session.user.email + '\'s domain to ' + domain);
			req.session.user.domain = domain;
			db.updateOne({
				email: req.session.user.email
			}, {
				$set: {
					domain: domain
				}
			}, function (err, result) {
				if (err === null) {
					deferred.resolve(true);
				} else {
					console.log("Register domain FAIL:" + err.body);
					deferred.reject(new Error(err.body));
				}
			});
		} else {
			deferred.reject("Domain already registered");
		}
	})

	return deferred.promise;
}


exports.resetPassword = function (req) {
	var deferred = Q.defer();
	var db = req.app.get("db").collection('users');
	var resetLink = req.body.resetLink;
	var password = req.body.password;
	var passwordConfirm = req.body.passwordConfirm;
	db.find({
		'resetLink': resetLink
	}).toArray(function (err, docs) {
		if (err != null) {
			console.log("Error: " + err.body);
			deferred.reject(err.body);
		} else if (docs.length === 0) {
			console.log("Error resetting password");
			deferred.reject("Error resetting password");
		} else {
			if (password === passwordConfirm) {
				var hash = bcrypt.hashSync(password, 8);
				db.updateOne({
					'resetLink': resetLink
				}, {
					$set: {
						password: hash,
						resetLink: ''
					}
				}, function (err, result) {
					if (err === null) {
						deferred.resolve('Password reset');
					} else {
						console.log("Reset password FAIL:" + err.body);
						deferred.reject(new Error(err.body));
					}
				});
			}
		}
	})

	return deferred.promise;
}

exports.updatePassword = function (req) {
	var deferred = Q.defer();
	var db = req.app.get("db").collection('users');
	var email = req.session.user.email;
	var newPassword = req.body.newPassword;
	var newPasswordConfirm = req.body.newPasswordConfirm;
	if (newPassword === newPasswordConfirm) {
		db.find({
			email: email
		}).toArray(function (err, docs) {
			if (err != null) {
				console.log("Error: " + err.body);
				deferred.reject(err.body);
			} else if (docs.length === 0) {
				console.log("Error confirming user");
				deferred.reject("Error confirming user");
			} else {
				var hashConfirm = req.body.password;
				if (bcrypt.compareSync(hashConfirm, docs[0].password)) {
					var hash = bcrypt.hashSync(newPassword, 8);
					db.updateOne({
						'email': email
					}, {
						$set: {
							password: hash
						}
					}, function (err, result) {
						if (err === null) {
							deferred.resolve('Password reset');
						} else {
							console.log("Reset password FAIL:" + err.body);
							deferred.reject(new Error(err.body));
						}
					});
				} else {
					deferred.reject("Incorrect password");
				}
			}
		})
	} else {
		deferred.reject("Passwords do not match");
	}

	return deferred.promise;
}

exports.reportDomain = function (req, domain, report) {
	var deferred = Q.defer();
	var db = req.app.get("db").collection('users');
	db.find({
		'domain': domain
	}).toArray(function (err, docs) {
		if (err != null) {
			console.log("Error: " + err.body);
			deferred.reject(err.body);
		} else if (docs.length === 0) {
			console.log("Error finding domain: " + domain);
			deferred.reject("Error finding domain");
		} else {
			var email = docs[0].email;
			console.log('reporting for email: ' + email);
			db = req.app.get("db").collection('reports');
			db.updateOne({
				'email': email
			}, {
				$push: {
					reports: {
						$each: [report],
						$slice: -10
					}
				}
			}, {
				upsert: true
			}, function (err, result) {
				if (err === null) {
					console.log('successful');
					deferred.resolve(docs[0].email);
				} else {
					console.log("Report add FAIL:" + err.body);
					deferred.reject(new Error(err.body));
				}
			});
		}
	})

	return deferred.promise;
}


exports.getReport = function (req, email) {
	var deferred = Q.defer();
	var db = req.app.get("db").collection('reports');
	db.find({
		'email': email
	}).toArray(function (err, docs) {
		if (err != null) {
			console.log("Error: " + err.body);
			deferred.reject(err.body);
		} else if (docs.length === 0) {
			deferred.resolve([]);
		} else if (docs[0].reports && docs[0].reports.length > 0) {
			//reversing array so recent reports are at the top
			deferred.resolve(docs[0].reports.reverse());
		} else {
			deferred.resolve([]);
		}
	})

	return deferred.promise;
}

exports.confirmationLink = function (req, confirmationLink) {
	var deferred = Q.defer();
	var db = req.app.get("db").collection('users');
	db.updateOne({
		'confirmationLink': confirmationLink
	}, {
		$set: {
			'confirmationLink': null
		}
	}, function (err, result) {
		if (err === null) {
			deferred.resolve();
		} else {
			console.log("confirmationLink FAIL:" + err.body);
			deferred.reject("Error confirming link");
		}
	});

	return deferred.promise;
}

exports.deleteAccount = function (req) {
	var deferred = Q.defer();
	var db = req.app.get("db").collection('users');
	db.deleteOne({
		'email': req.session.user.email
	}, function (err, result) {
		if (err === null) {
			db = req.app.get('db').collection('reports');
			db.deleteMany({
				'email': req.session.user.email
			}, function (err, result) {
				if (err === null) {
					deferred.resolve();
				} else {
					console.log("confirmationLink FAIL:" + err.body);
					deferred.reject("Error confirming link");
				}
			});
		} else {
			console.log("delete account FAIL:" + err.body);
			deferred.reject("Error deleting account");
		}
	});

	return deferred.promise;
}


exports.deleteDetections = function (req) {
	var deferred = Q.defer();
	var email = req.session.user.email;
	var db = req.app.get("db").collection('reports');
	db.deleteMany({
		'email': email
	}, function () {
		deferred.resolve();
	})

	return deferred.promise;
}

exports.updateEmail = function (req) {
	var deferred = Q.defer();
	var db = req.app.get("db").collection('users');
	var oldEmail = req.session.user.email;
	var newEmail = req.body.newEmail;
	//Check the database to verify email does not exist
	if (!oldEmail) deferred.reject("User not signed in");
	db.find({
		'email': newEmail
	}).toArray(function (err, docs) {
		if (docs.length === 0) {
			if (err != null) {
				console.log("Error: " + err.body);
				deferred.reject(err.body);
			} else {
				db.updateOne({
					email: oldEmail
				}, {
					$set: {
						email: newEmail
					}
				}, function (err, result) {
					if (err === null) {
						db = req.app.get("db").collection('reports');
						//Update reports to link with new email
						console.log('oldEmail: ' + oldEmail);
						console.log('newEmail: ' + newEmail);
						db.update({
							email: oldEmail
						}, {
							$set: {
								email: newEmail
							}
						}, function (err, result) {
							if (err === null) {
								deferred.resolve('Email reset');
							} else {
								console.log("Reset email FAIL:" + err.body);
								deferred.reject(new Error(err.body));
							}
						})
					} else {
						console.log("Reset email FAIL:" + err.body);
						deferred.reject(new Error(err.body));
					}
				})
			}
		} else {
			deferred.reject('Email taken');
		}
	})
	return deferred.promise;
}

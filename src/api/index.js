import { CognitoUserPool,
         CognitoUserAttribute,
         CognitoUser,
         AuthenticationDetails } from 'amazon-cognito-identity-js';
import AWS from 'aws-sdk';

const region  = 'us-east-1';
const poolData = {
    UserPoolId : 'us-east-1_YuTF9ST4J',
    ClientId : '6ctsnjjglmtna2q5fgtrjug47k'
};

const userPool = new CognitoUserPool(poolData);

const base = 'https://yfo3vr9rw4.execute-api.us-east-1.amazonaws.com/dev';

const doFetch = (method, route, token, params = {}) => {
  const headers = new Headers({
    'content-type': 'application/json',
    Authorization: token
  });

  const queryParams = Object.keys(params)
    .map(key => key + '=' + params[key])
    .join('&');

  const url = base + route + (queryParams.length > 0 ? '?' + queryParams : '');

  const request = new Request(
    url,
    {
      method,
      headers,
      mode: 'cors',
      cache: 'no-cache'
    }
  );

  return fetch(request).then(r => r.json());
};

const addImport = (userInput, token) => {
  // Parse user input
  const {repository_name, import_name} = userInput;

  return doFetch('POST', '/repository', token, {
    name: repository_name
  })
  .then(data => data.uuid)
  .then(rep_uuid => {
    console.log('repo uuid ' + rep_uuid);
    return doFetch('POST', '/import', token, {
      repository: rep_uuid,
      name: import_name
    })
  })
  .then(data => data.uuid);
}

const confirmImport = (uuid, token) => {

  const endpoint = '/import/' + uuid + '/complete';
  return doFetch('PUT', endpoint, token);
}

const getImports = (repo, token) => {

  const endpoint = '/repository/' + repo + '/imports';
  return doFetch('GET', endpoint, token)
    .then(imports => {

      return Promise.all(imports.data.map(imp => {
        return {
          uuid: imp.uuid,
          name: imp.name
        }
      }))
    })
}

const getImages = (imp, token) => {

  const endpointFileset = '/import/' + imp + '/filesets';

  const keyToUrl = key => {
    return 'hello'; // DERP
    const parts = key.split('/');
    const path = parts.slice(3).join('/');
    return parts[2] + '.s3.amazonaws.com/' + path;
  }

  return doFetch('GET', endpointFileset, token)
    .then(filesets => {
        return Promise.all(filesets.data.map(fileset => {
          let endpoint = '/fileset/' + fileset.uuid + '/images';
          return doFetch('GET', endpoint, token)
            .then(images => {
              return images.data.map(img => {
                return {
                  uuid: img.uuid,
                  url: keyToUrl(img.key),
                  levelCount: parseInt(img.pyramidLevels, 10),
                  name: img.uuid.split('-')[0]
                };
              });
            });
        }));
    })
    .then(images => [].concat.apply([], images))
    .then(images => {
      const promises = images.map(img => {
        return getImageMetadata(img.uuid, token)
          .then(meta => {
            const {pixels} = meta.data;
            const {SizeC} = pixels;
            const {SizeX, SizeY} = pixels;
            return {
              ...img,
              channelCount: parseInt(SizeC, 10),
              fullHeight: parseInt(SizeY, 10),
              fullWidth: parseInt(SizeX, 10)
            };
          });
      });
      return Promise.all(promises);
    });
}

const getImageMetadata = (img, token) => {

  const endpoint = '/image/' + img + '/dimensions';
  return doFetch('GET', endpoint, token);

}

const getImageCredentials = (img, token) => {

  const endpoint = '/image/' + img + '/credentials';
  return doFetch('GET', endpoint, token);
}

const getRepository = (uuid, token) => {

  const endpoint = '/repository/' + uuid;
  return doFetch('GET', endpoint, token);
}

const authenticateUser = (cognitoUser, authenticationDetails) => {

  const handleCode = verification_code => {
    return new Promise((resolve, reject) => {
      reject({
        required: ["new_password"],
        name: "PasswordResetException",
        retry: userInput => {
          // Handle new password
          const {new_password} = userInput;
          return new Promise((resolve, reject) => {
            cognitoUser.confirmPassword(
              verification_code,
              new_password, makeCallbacks(
                () => {},
                reject
              )
            )
          });
        }
      });
    });
  }

  const sendCode = () => {
    return new Promise((resolve, reject) => {
      const notify = e => {
        const {Destination} = e.CodeDeliveryDetails;
        reject({
          message: "Email sent to "+ Destination
        })
      }
      cognitoUser.forgotPassword(
       makeCallbacks(notify, reject)
      );
    });
  }

  const makeCallbacks = (resolve, reject) => {
    return {
      onSuccess: resolve,
      onFailure: err => {
        switch (err.name) {
          case "PasswordResetRequiredException":
            reject({...err,
              required: ["verification_code"],
              retry: userInput => {
                const {verification_code} = userInput;
                if (verification_code) {
                  return handleCode(verification_code);
                }
                return sendCode();
              }
            });
            break;
          default:
            reject(err);
        }
      },
      mfaRequired: codeDeliveryDetails => reject(codeDeliveryDetails),
      newPasswordRequired: (fields, required) => {
        reject({
          name: "PasswordResetException",
          message: "Password Reset Required",
          required: required.concat("new_password"),
          retry: userInput => {
            return new Promise((resolve, reject) => {
              const {new_password} = userInput;

              // Take all new attributes from user
              let userAttributes = {...fields};
              required.forEach((key) => {
                userAttributes[key] = userInput[key];
              })
              delete userAttributes.email_verified;

              // Reattempt the login
              cognitoUser.completeNewPasswordChallenge(
                new_password, userAttributes,
                makeCallbacks(resolve, reject));
            });
          }
        });
      }
    };
  }

  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(
      authenticationDetails,
      makeCallbacks(resolve, reject));
  });
};

const getAttributes = cognitoUser => {
  return new Promise((resolve, reject) => {
    cognitoUser.getUserAttributes((err, result) => {
      if (err) { reject(err); }
      else { resolve(result); }
    })
  })
};

export const login = (email, password) => {
  const userData = { Username : email, Pool : userPool };
  const authenticationData = { Username : email, Password : password };
  const cognitoUser = new CognitoUser(userData);
  const authenticationDetails = new AuthenticationDetails(authenticationData);

  const token = authenticateUser(cognitoUser, authenticationDetails)
    .then(response => response.getIdToken().getJwtToken());

  const gotAttrs = token
    .then(() => getAttributes(cognitoUser))
    .then(attrs => {
      const obj = {};
      attrs.map(attr => {
        obj[attr['Name']] = attr['Value']
      })
      return obj;
    });

  return Promise.all([token, gotAttrs])
    .then(values => {
      return values;
    })
    .then(values => ({
      token: values[0],
      attrs: values[1]
    }));
}

export const fetchTile = (credentialsHolder, onError) => options => {

    const {credentials} = credentialsHolder;
    const logError = onError || console.error;

    const credentialsAWS = new AWS.Credentials({
      accessKeyId: credentials.AccessKeyId,
      sessionToken: credentials.SessionToken,
      secretAccessKey: credentials.SecretAccessKey
    });

    var config = new AWS.Config({
      credentials: credentialsAWS,
      region: 'us-east-1'
    });

    AWS.config.credentials = credentialsAWS;

    const getObject = (bucket, key) => {
      return new Promise((resolve, reject) => {
        const s3 = new AWS.S3({ credentialsAWS });
        const params = { Bucket: bucket, Key: key };
        s3.getObject(params, (err, data) => err ? reject(err) : resolve(data));
      });
    };

    // Split the URL into bucket and key
    var no_protocol = options.url.split('://')[1] || options.url;
    var [bucket, key] = no_protocol.split('.s3.amazonaws.com/');
    if (key === undefined) {
      var first_slash = no_protocol.indexOf('/');
      bucket = no_protocol.slice(0, first_slash);
      key = no_protocol.slice(first_slash + 1);
    }

    getObject(bucket, key)
      .then(obj => {
        options.success({response: obj.Body})
       }, logError)
      .catch(logError);
};

export default {
  login,
  doFetch,
  fetchTile,
  addImport,
  confirmImport,
  getRepository,
  getImageMetadata,
  getImageCredentials,
  getImports,
  getImages,
};

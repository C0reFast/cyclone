import PropTypes from 'prop-types';
import { Formik } from 'formik';
import { inject, observer } from 'mobx-react';
import { toJS } from 'mobx';
import { Row, Col, Spin } from 'antd';
import FormContent from './FormContent';
import { IntegrationTypeMap } from '@/consts/const.js';
import { validateForm } from './validate';

@inject('integration')
@observer
export default class IntegrationForm extends React.Component {
  constructor(props) {
    super(props);
    const {
      match: { params },
    } = props;
    this.update = !!_.get(params, 'integrationName');
    if (this.update) {
      props.integration.getIntegration(params.integrationName);
    }
  }

  static propTypes = {
    history: PropTypes.object,
    match: PropTypes.object,
    integration: PropTypes.object,
    initialFormData: PropTypes.object,
    setTouched: PropTypes.func,
    isValid: PropTypes.bool,
    values: PropTypes.object,
  };

  handleCancle = () => {
    const { history } = this.props;
    history.push('/integration');
  };

  generateData = data => {
    const metadata = {
      creationTime: Date.now().toString(),
      annotations: {
        'cyclone.io/description': _.get(data, 'metadata.description', ''),
        'cyclone.io/alias': _.get(data, 'metadata.alias', ''),
      },
    };
    const type = _.get(data, 'spec.type');
    const spec = _.pick(data.spec, [`${IntegrationTypeMap[type]}`, 'type']); // 只取type类型的表单
    if (type === 'SCM') {
      const scmValueMap = {
        UserPwd: ['user', 'password', 'type'],
        Token: ['token', 'server', 'type'],
      };
      const validateType = _.get(data, 'spec.scm.validateType');
      const scmObj = _.pick(spec.scm, scmValueMap[validateType]);
      spec[`${IntegrationTypeMap[type]}`] = scmObj;
    }

    if (type === 'Cluster') {
      const clusterValueMap = {
        UserPwd: ['user', 'password', 'server'],
        Token: ['bearerToken', 'server'],
      };
      const validateType = _.get(data, 'spec.cluster.credential.validateType');
      const clusterObj = _.pick(
        spec.cluster.credential,
        clusterValueMap[validateType]
      );
      const isControlCluster = _.get(data, 'spec.cluster.isControlCluster');
      const isWorkerCluster = _.get(data, 'spec.cluster.isWorkerCluster');
      spec[`${IntegrationTypeMap[type]}`] = {
        credential: clusterObj,
        tlsClientConfig: {
          insecure: true,
        },
        isControlCluster,
        isWorkerCluster,
      };
      if (isWorkerCluster) {
        const namespace = _.get(data, 'spec.cluster.namespace', '');
        const pvc = _.get(data, 'spec.cluster.pvc', '');
        _.assignIn(spec[`${IntegrationTypeMap[type]}`], { namespace, pvc });
      }
    }

    return { metadata, spec };
  };

  initFormValue = () => {
    const integrationDetail = toJS(this.props.integration.integrationDetail);
    return this.mapRequestFormToInitForm(integrationDetail);
  };

  componentWillUnmount() {
    this.props.integration.resetIntegration();
  }

  generateSpecObj = data => {
    let defaultSpec = {
      scm: {
        server: 'https://github.com',
        type: 'GitHub',
        validateType: 'Token',
      },
      dockerRegistry: {
        server: '',
        user: '',
        password: '',
      },
      sonarQube: {
        server: '',
        token: '',
      },
      cluster: {
        credential: {
          validateType: 'Token',
          server: '',
        },
        isControlCluster: false,
        isWorkerCluster: false,
      },
      type: '',
    };
    const type = _.get(data, 'spec.type');
    const spec = _.get(data, 'spec');
    const specData = _.pick(spec, [`${IntegrationTypeMap[type]}`, 'type']);
    if (type === 'SCM') {
      const token = _.get(data, 'spec.scm.token');
      if (!token) {
        specData.scm.validateType = 'UserPwd';
      } else {
        specData.scm.validateType = 'Token';
      }
    }
    if (type === 'Cluster') {
      const token = _.get(data, 'spec.cluster.credential.bearerToken');
      if (!token) {
        specData.cluster.credential.validateType = 'UserPwd';
      } else {
        specData.cluster.credential.validateType = 'Token';
      }
    }
    return _.assign(defaultSpec, specData);
  };

  mapRequestFormToInitForm = data => {
    const alias = _.get(
      data,
      ['metadata', 'annotations', 'cyclone.io/alias'],
      ''
    );
    const description = _.get(
      data,
      ['metadata', 'annotations', 'cyclone.io/description'],
      ''
    );
    const creationTime = _.get(data, 'metadata.creationTimestamp', '');
    const spec = this.generateSpecObj(data);
    return {
      metadata: { alias, description, creationTime },
      spec,
    };
  };

  submit = props => {
    const { setTouched, isValid, values } = props;
    const {
      spec: { type },
    } = values;

    // TODO touchObj need optimization
    if (!isValid) {
      const touchObj = {
        metadata: {
          alias: true,
        },
        spec: {
          type: true,
        },
      };
      if (type === 'SCM') {
        const {
          values: {
            spec: {
              scm: { validateType, type: scmTtype },
            },
          },
        } = props;
        const touchMap = {
          Token: { token: true, server: true },
          UserPwd: { user: true, password: true, server: true },
        };
        const scmTouchObj =
          scmTtype !== 'SVN'
            ? touchMap[validateType]
            : {
                server: true,
                user: true,
                password: true,
              };
        touchObj.spec.scm = scmTouchObj;
      }

      if (type === 'DockerRegistry') {
        touchObj.spec.dockerRegistry = {
          server: true,
          user: true,
          password: true,
        };
      }

      if (type === 'SonarQube') {
        touchObj.spec.sonarQube = {
          server: true,
          token: true,
        };
      }

      if (type === 'Cluster') {
        const {
          values: {
            spec: {
              cluster: {
                credential: { validateType },
              },
            },
          },
        } = props;
        const touchMap = {
          Token: { bearerToken: true, server: true },
          UserPwd: { user: true, password: true, server: true },
        };
        const clusterTouchObj = touchMap[validateType];
        touchObj.spec.cluster = {
          credential: clusterTouchObj,
        };
      }
      setTouched(touchObj);
      return;
    } else {
      const { integration } = this.props;
      const submitData = this.generateData(values);
      if (this.update) {
        const {
          match: { params },
        } = this.props;
        integration.updateIntegration(
          submitData,
          params.integrationName,
          () => {
            this.props.history.replace(`/integration`);
          }
        );
      } else {
        integration.createIntegration(submitData, () => {
          this.props.history.replace(`/integration`);
        });
      }
    }
  };

  render() {
    if (this.props.integration.detailLoading) {
      return (
        <div className="loading">
          <Spin />
        </div>
      );
    }
    const initialValues = this.initFormValue();
    return (
      <div className="integration-form">
        <div className="head-bar">
          <h2>
            {this.update
              ? intl.get('integration.updateexternalsystem')
              : intl.get('integration.addexternalsystem')}
          </h2>
        </div>
        <Row>
          <Col span={20}>
            <Formik
              enableReinitialize={true}
              initialValues={initialValues}
              validate={validateForm}
              render={props => (
                <FormContent
                  {...props}
                  update={this.update}
                  submit={this.submit.bind(this, props)}
                  handleCancle={this.handleCancle}
                />
              )}
            />
          </Col>
        </Row>
      </div>
    );
  }
}

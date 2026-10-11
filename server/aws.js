import {
  EC2Client,
  DescribeInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  RebootInstancesCommand,
  TerminateInstancesCommand,
  CreateTagsCommand,
  RunInstancesCommand,
  DescribeImagesCommand,
  CreateImageCommand,
  DeregisterImageCommand,
  DescribeVolumesCommand,
  CreateVolumeCommand,
  DeleteVolumeCommand,
  AttachVolumeCommand,
  DetachVolumeCommand,
  ModifyInstanceAttributeCommand,
  ModifyImageAttributeCommand,
  CreateKeyPairCommand,
  GetPasswordDataCommand,
  DescribeInstanceTypeOfferingsCommand,
  DescribeInstanceStatusCommand,
  DescribeKeyPairsCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
} from '@aws-sdk/client-ec2';
import { ServiceQuotasClient, ListServiceQuotasCommand } from '@aws-sdk/client-service-quotas';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import crypto from 'node:crypto';

export function makeClient({ accessKey, secretKey, region }) {
  return new EC2Client({
    region: region || 'us-east-1',
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
}

const X86_LADDER = ['t2.micro','t3.micro','t2.small','t3.small','t2.medium','t3.medium','m5.large','t3.large','c5.large','m5.xlarge','m5.2xlarge','m5.4xlarge','m5.8xlarge','m5.12xlarge','m5.16xlarge','m5.24xlarge','m5a.24xlarge','m5.metal','z1d.large','z1d.xlarge'];
const ARM_LADDER = ['t4g.micro','t4g.small','t4g.medium','a1.medium','a1.large','a1.xlarge','m6g.large','m6g.xlarge','m6g.2xlarge','m6g.4xlarge','m6g.8xlarge','m6g.16xlarge','m6g.metal'];

async function availableZoneTypes(client, region) {
  try {
    const out = await client.send(new DescribeInstanceTypeOfferingsCommand({
      LocationType: 'availability-zone',
      Filters: [{ Name: 'location', Values: [region] }],
    }));
    return new Set((out.InstanceTypeOfferings || []).map((o) => o.InstanceType));
  } catch {
    return null;
  }
}

export async function listInstances(c, { query = {} } = {}) {
  const out = await c.send(new DescribeInstancesCommand(query));
  const instances = [];
  for (const r of out.Reservations || []) {
    for (const i of r.Instances || []) {
      const name = (i.Tags || []).find((t) => t.Key === 'Name')?.Value || '';
      const platform = i.Platform ? (i.Platform === 'windows' ? 'windows' : i.Platform) : 'linux';
      instances.push({
        id: i.InstanceId,
        name,
        state: i.State?.Name || '',
        type: i.InstanceType,
        public_ip: i.PublicIpAddress || '—',
        private_ip: i.PrivateIpAddress || '—',
        platform,
        az: i.Placement?.AvailabilityZone || '',
        launched: i.LaunchTime ? new Date(i.LaunchTime).toISOString() : '',
      });
    }
  }
  return instances;
}

export async function startInstances(c, ids) {
  await c.send(new StartInstancesCommand({ InstanceIds: ids }));
  return `Started: ${ids.join(', ')}`;
}

export async function stopInstances(c, ids) {
  await c.send(new StopInstancesCommand({ InstanceIds: ids }));
  return `Stopped: ${ids.join(', ')}`;
}

export async function rebootInstances(c, ids) {
  await c.send(new RebootInstancesCommand({ InstanceIds: ids }));
  return `Rebooted: ${ids.join(', ')}`;
}

export async function terminateInstances(c, ids) {
  await c.send(new TerminateInstancesCommand({ InstanceIds: ids }));
  return `Terminated: ${ids.join(', ')}`;
}

export async function renameInstance(c, { instanceId, name }) {
  await c.send(new CreateTagsCommand({
    Resources: [instanceId],
    Tags: [{ Key: 'Name', Value: name }],
  }));
  return `Renamed: ${name}`;
}

export async function modifyInstanceType(c, { instanceId, type }) {
  const curr = await listInstances(c, { query: { Filters: [{ Name: 'instance-id', Values: [instanceId] }] } });
  if (!curr.length) throw new Error('Instance nahi mila');
  if (curr[0].state !== 'stopped') {
    throw new Error('Type badalne ke liye instance pehle STOP karo');
  }
  if (curr[0].type === type) return 'Ye type already set hai';
  await c.send(new ModifyInstanceAttributeCommand({ InstanceId: instanceId, InstanceType: { Value: type } }));
  return `${instanceId} → ${type}`;
}

export async function shrinkInstanceType(c, { instanceId, region }) {
  const curr = await listInstances(c, { query: { Filters: [{ Name: 'instance-id', Values: [instanceId] }] } });
  if (!curr.length) throw new Error('Instance nahi mila');
  const current = curr[0];
  if (current.state !== 'stopped') {
    throw new Error('Shrink karne ke liye instance pehle STOP karo');
  }
  const isArm = current.type.startsWith('t4g') || current.type.startsWith('a1') || current.type.startsWith('m6g') || current.type.startsWith('i3en');
  const ladder = isArm ? ARM_LADDER : X86_LADDER;
  const idx = ladder.indexOf(current.type);
  if (idx <= 0) return `${instanceId} already sabse chhota hai (${current.type})`;

  let zoneTypes = await availableZoneTypes(c, current.az);
  if (!zoneTypes) {
    for (let i = idx - 1; i >= 0; i--) {
      try {
        await c.send(new ModifyInstanceAttributeCommand({ InstanceId: instanceId, InstanceType: { Value: ladder[i] } }));
        return `${instanceId} ${current.type} → ${ladder[i]}`;
      } catch { /* try smaller */ }
    }
    throw new Error('Chhota type apply nahi hua');
  }
  for (let i = idx - 1; i >= 0; i--) {
    const candidate = ladder[i];
    if (zoneTypes.has(candidate)) {
      await c.send(new ModifyInstanceAttributeCommand({ InstanceId: instanceId, InstanceType: { Value: candidate } }));
      return `${instanceId} ${current.type} → ${candidate}`;
    }
  }
  return `${instanceId} already sabse chhota supported hai (${current.type})`;
}

export async function getQuotas(_c, { region, accessKey, secretKey }) {
  const sq = new ServiceQuotasClient({
    region,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
  const codes = [
    { code: 'L-1216C47A', name: 'Running On-Demand EC2 vCPU' },
    { code: 'L-1234567890', name: 'EC2 Instances' },
  ];
  const quotas = [];
  for (const cde of codes) {
    try {
      const out = await sq.send(new ListServiceQuotasCommand({ ServiceCode: 'ec2' }));
      const found = (out.Quotas || []).find((q) => q.QuotaCode === cde.code || q.QuotaName === cde.name);
      if (found) quotas.push({ code: found.QuotaCode, name: found.QuotaName, value: found.Value });
    } catch { /* skip */ }
  }
  try {
    const out = await sq.send(new ListServiceQuotasCommand({ ServiceCode: 'ec2' }));
    for (const q of out.Quotas || []) {
      if (!quotas.find((x) => x.code === q.QuotaCode)) {
        quotas.push({ code: q.QuotaCode, name: q.QuotaName, value: q.Value });
      }
    }
  } catch { /* skip */ }
  return quotas;
}

export async function listAmis(c, { owner, shared = false, query = {} } = {}) {
  const owners = [];
  if (owner) owners.push(owner);
  else if (!shared) owners.push('self');
  if (shared) owners.push('amazon', 'aws-marketplace');
  const out = await c.send(new DescribeImagesCommand({
    ...query,
    ExecutableUsers: shared ? ['all'] : undefined,
    Owners: owners.length ? owners : undefined,
  }));
  return (out.Images || []).map((i) => ({
    id: i.ImageId,
    name: i.Name || i.Description || i.ImageId,
    state: i.State,
    created: i.CreationDate || '',
    arch: i.Architecture || '',
    rootDevice: i.RootDeviceName || '',
  }));
}

export async function createImage(c, { instanceId, name }) {
  const out = await c.send(new CreateImageCommand({ InstanceId: instanceId, Name: name, NoReboot: true }));
  return out.ImageId;
}

export async function deleteAmi(c, ids) {
  for (const id of ids) {
    await c.send(new DeregisterImageCommand({ ImageId: id }));
  }
  return `Deregistered: ${ids.join(', ')}`;
}

export async function launchInstance(c, cfg) {
  const params = {
    ImageId: cfg.ami,
    InstanceType: cfg.type,
    MinCount: Math.max(1, Number(cfg.count) || 1),
    MaxCount: Math.max(1, Number(cfg.count) || 1),
    KeyName: cfg.keyName || undefined,
    SecurityGroupIds: cfg.securityGroupIds?.length ? cfg.securityGroupIds : undefined,
    SubnetId: cfg.subnetId || undefined,
    IamInstanceProfile: cfg.iamRole
      ? { Name: cfg.iamRole }
      : undefined,
    UserData: cfg.userData ? Buffer.from(cfg.userData).toString('base64') : undefined,
    BlockDeviceMappings: cfg.volumeSize
      ? [{ DeviceName: '/dev/sda1', Ebs: { VolumeSize: Number(cfg.volumeSize), VolumeType: 'gp3' } }]
      : undefined,
  };
  const out = await c.send(new RunInstancesCommand(params));
  const ids = (out.Instances || []).map((i) => i.InstanceId);
  if (cfg.name && ids.length) {
    try {
      await c.send(new CreateTagsCommand({ Resources: ids, Tags: [{ Key: 'Name', Value: cfg.name }] }));
    } catch { /* ignore */ }
  }
  return ids;
}

export async function listVolumes(c, { instanceId } = {}) {
  const out = await c.send(new DescribeVolumesCommand({
    Filters: instanceId ? [{ Name: 'attachment.instance-id', Values: [instanceId] }] : undefined,
  }));
  return (out.Volumes || []).map((v) => ({
    id: v.VolumeId,
    size: v.Size,
    type: v.VolumeType,
    state: v.State,
    az: v.AvailabilityZone,
    instance: v.Attachments?.[0]?.InstanceId || '',
    device: v.Attachments?.[0]?.Device || '',
    encrypted: v.Encrypted || false,
  }));
}

export async function createVolume(c, { size, type = 'gp3', az }) {
  const out = await c.send(new CreateVolumeCommand({ Size: Number(size), VolumeType: type, AvailabilityZone: az }));
  return out.VolumeId;
}

export async function deleteVolume(c, ids) {
  for (const id of ids) {
    await c.send(new DeleteVolumeCommand({ VolumeId: id }));
  }
  return `Deleted: ${ids.join(', ')}`;
}

export async function attachVolume(c, { volumeId, instanceId, device = '/dev/sdf' }) {
  await c.send(new AttachVolumeCommand({ VolumeId: volumeId, InstanceId: instanceId, Device: device }));
  return `Attached ${volumeId} → ${instanceId}`;
}

export async function detachVolume(c, volumeId) {
  await c.send(new DetachVolumeCommand({ VolumeId: volumeId }));
  return `Detached ${volumeId}`;
}

export async function listKeyPairs(c) {
  const out = await c.send(new DescribeKeyPairsCommand({}));
  return (out.KeyPairs || []).map((k) => k.KeyName);
}

export async function listSecurityGroups(c) {
  const out = await c.send(new DescribeSecurityGroupsCommand({}));
  return (out.SecurityGroups || []).map((g) => ({ id: g.GroupId, name: g.GroupName }));
}

export async function listSubnets(c) {
  const out = await c.send(new DescribeSubnetsCommand({}));
  return (out.Subnets || []).map((s) => ({ id: s.SubnetId, az: s.AvailabilityZone, cidr: s.CidrBlock }));
}

export async function instanceStatus(c, ids) {
  const out = await c.send(new DescribeInstanceStatusCommand({ InstanceIds: ids }));
  return Object.fromEntries((out.InstanceStatuses || []).map((s) => [s.InstanceId, s.InstanceState?.Name || '']));
}

export async function getAccountId({ accessKey, secretKey, region }) {
  const sts = new STSClient({
    region: region || 'us-east-1',
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
  const out = await sts.send(new GetCallerIdentityCommand({}));
  return out.Account;
}

export async function createKeyPair(c, { keyName }) {
  const out = await c.send(new CreateKeyPairCommand({ KeyName: keyName, KeyType: 'rsa', KeyFormat: 'pem' }));
  return { keyName: out.KeyName, keyMaterial: out.KeyMaterial, keyPairId: out.KeyPairId };
}

export async function shareAmi(c, { amiId, targetAccountId }) {
  await c.send(new ModifyImageAttributeCommand({
    ImageId: amiId,
    LaunchPermission: { Add: [{ UserId: targetAccountId }] },
  }));
  return `Shared ${amiId} with ${targetAccountId}`;
}

export async function getWindowsPassword(c, { instanceId, pemContent }) {
  const out = await c.send(new GetPasswordDataCommand({ InstanceId: instanceId }));
  if (!out.PasswordData) return null;
  const encrypted = Buffer.from(out.PasswordData, 'base64');
  const key = crypto.createPrivateKey(pemContent);
  const decrypted = crypto.privateDecrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, encrypted);
  return decrypted.toString('utf8');
}

const OS_AMI = {
  'amazon-linux:2023': { owner: 'amazon', name: 'al2023-ami-2023.*-x86_64' },
  'amazon-linux:2': { owner: 'amazon', name: 'amzn2-ami-hvm-*-x86_64-gp2' },
  'ubuntu:22.04': { owner: '099720109477', name: 'ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*' },
  'ubuntu:20.04': { owner: '099720109477', name: 'ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-*' },
  'windows:2025': { owner: 'amazon', name: 'Windows_Server-2025-English-Full-Base-*' },
  'windows:2022': { owner: 'amazon', name: 'Windows_Server-2022-English-Full-Base-*' },
  'windows:2019': { owner: 'amazon', name: 'Windows_Server-2019-English-Full-Base-*' },
};

async function resolveAmi(c, os, version) {
  const spec = OS_AMI[`${os}:${version}`];
  if (!spec) return null;
  const out = await c.send(new DescribeImagesCommand({
    Owners: [spec.owner],
    Filters: [{ Name: 'name', Values: [spec.name] }, { Name: 'state', Values: ['available'] }],
  }));
  const imgs = (out.Images || []).sort((a, b) => new Date(b.CreationDate || 0).getTime() - new Date(a.CreationDate || 0).getTime());
  return imgs[0]?.ImageId || null;
}

export async function launchFromConfig(c, { config }) {
  const cfg = config || {};
  let ami = cfg.amiId;
  if (!ami || ami === '__select__') {
    ami = await resolveAmi(c, cfg.os || 'amazon-linux', cfg.version || '2023');
  }
  if (!ami) throw new Error('AMI resolve nahi hui — OS/version check karo ya custom AMI ID do');
  const params = {
    ImageId: ami,
    InstanceType: cfg.instanceType || 't2.micro',
    MinCount: Math.max(1, Number(cfg.count) || 1),
    MaxCount: Math.max(1, Number(cfg.count) || 1),
    KeyName: cfg.keyPair || undefined,
    BlockDeviceMappings: cfg.rootSize
      ? [{ DeviceName: '/dev/sda1', Ebs: { VolumeSize: Number(cfg.rootSize), VolumeType: cfg.rootType || 'gp3' } }]
      : undefined,
  };
  if (cfg.spot) params.InstanceMarketOptions = { MarketType: 'spot' };
  const out = await c.send(new RunInstancesCommand(params));
  const ids = (out.Instances || []).map((i) => i.InstanceId);
  if (cfg.name && ids.length) {
    try {
      await c.send(new CreateTagsCommand({ Resources: ids, Tags: [{ Key: 'Name', Value: cfg.name }] }));
    } catch { /* ignore */ }
  }
  return ids;
}

export async function awsAction(action, client, creds, payload) {
  switch (action) {
    case 'list-instances': return { instances: await listInstances(client, payload) };
    case 'list-amis': return { amis: await listAmis(client, payload) };
    case 'list-volumes': return { volumes: await listVolumes(client, payload) };
    case 'list-key-pairs': { const kp = await listKeyPairs(client); return { keys: kp, keyPairs: kp }; }
    case 'list-security-groups': return { groups: await listSecurityGroups(client) };
    case 'list-subnets': return { subnets: await listSubnets(client) };
    case 'get-quotas': return { quotas: await getQuotas(client, creds) };
    case 'get-account-id': return { accountId: await getAccountId(creds) };
    case 'start-instances': return { message: await startInstances(client, payload.instanceIds || []) };
    case 'stop-instances': return { message: await stopInstances(client, payload.instanceIds || []) };
    case 'reboot-instances': return { message: await rebootInstances(client, payload.instanceIds || []) };
    case 'terminate-instances': return { message: await terminateInstances(client, payload.instanceIds || []) };
    case 'rename-instance': return { message: await renameInstance(client, payload) };
    case 'modify-instance-type': return { message: await modifyInstanceType(client, payload) };
    case 'shrink-instance-type': return { message: await shrinkInstanceType(client, payload) };
    case 'create-ami': return { imageId: await createImage(client, payload) };
    case 'create-image': return { imageId: await createImage(client, payload) };
    case 'delete-ami': return { message: await deleteAmi(client, [payload.amiId].filter(Boolean)) };
    case 'delete-amis': return { message: await deleteAmi(client, payload.instanceIds || []) };
    case 'share-ami': return { message: await shareAmi(client, payload) };
    case 'create-key-pair': return { ...(await createKeyPair(client, payload)) };
    case 'get-password': return { password: await getWindowsPassword(client, payload) };
    case 'launch-instance': return { ids: await launchFromConfig(client, payload) };
    case 'create-volume': return { volumeId: await createVolume(client, payload) };
    case 'delete-volumes': return { message: await deleteVolume(client, payload.instanceIds || []) };
    case 'attach-volume': return { message: await attachVolume(client, payload) };
    case 'detach-volume': return { message: await detachVolume(client, payload.volumeId) };
    default: throw new Error(`Unknown action: ${action}`);
  }
}
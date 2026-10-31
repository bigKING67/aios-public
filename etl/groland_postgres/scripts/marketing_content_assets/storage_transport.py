"""Storage-only TCP address override; URLs, SigV4 and TLS identity keep the origin."""
from urllib.parse import urlsplit

import requests
from requests.adapters import HTTPAdapter
from urllib3 import PoolManager


class _StoragePoolManager(PoolManager):
  def __init__(self, connect_ip: str, **kwargs):
    self.connect_ip = connect_ip
    super().__init__(**kwargs)

  def connection_from_host(self, host, port=None, scheme="http", pool_kwargs=None):
    # Retain Requests' CA/mTLS pool keys. Different buckets keep distinct TLS identities
    # even when their sockets connect to the same address. Works with Requests 2.31+.
    tls = {**(pool_kwargs or {}), "server_hostname": host, "assert_hostname": host}
    return super().connection_from_host(self.connect_ip, port=port, scheme=scheme, pool_kwargs=tls)


class StorageAddressAdapter(HTTPAdapter):
  def __init__(self, connect_ip: str, authorities: set[str]):
    self.connect_ip = connect_ip
    self.authorities = {authority.lower() for authority in authorities}
    super().__init__()

  def _origin(self, url: str):
    origin = urlsplit(url)
    if (origin.scheme != "https" or origin.netloc.lower() not in self.authorities
        or not origin.hostname or origin.username is not None):
      raise requests.exceptions.InvalidURL("TOS_CONNECT_IP only permits configured HTTPS storage origins")
    return origin

  def init_poolmanager(self, connections, maxsize, block=False, **pool_kwargs):
    super().init_poolmanager(connections, maxsize, block=block, **pool_kwargs)
    self.poolmanager = _StoragePoolManager(self.connect_ip, num_pools=connections,
                                         maxsize=maxsize, block=block, **pool_kwargs)

  def send(self, request, stream=False, timeout=None, verify=True, cert=None, proxies=None):
    origin = self._origin(request.url)
    if not verify:
      raise ValueError("TOS_CONNECT_IP requires certificate verification")
    # urllib3's pool host is the TCP address. Host must still match the signed URL.
    request.headers["Host"] = origin.netloc
    response = super().send(request, stream=stream, timeout=timeout, verify=verify,
                            cert=cert, proxies={})
    if response.is_redirect:
      response.close()
      raise requests.exceptions.InvalidURL("TOS_CONNECT_IP does not allow storage redirects")
    return response

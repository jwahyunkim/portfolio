// src/services/postgres/dmpdProdOrderService.js
import * as workCenterDao from '../../models/postgres/workCenterDao.js';
import * as lineDao from '../../models/postgres/lineDao.js';
import * as machineDao from '../../models/postgres/machineDao.js';
import * as dmpdProdOrderDao from '../../models/postgres/dmpdProdOrderDao.js';
import * as plantDao from '../../models/postgres/plantDao.js';
/**
 * Plant 옵션 조회 (service)
 * - DAO: plantDao.findPlants 사용
 */
export async function getPlants(client, { workCenter, line, materialCode }) {
  return plantDao.findPlants(client, { workCenter, line, materialCode });
}

/**
 * Work Center 옵션 조회 (service)
 * - DAO: workCenterDao.findWorkCenters 사용
 */
export async function getWorkCenters(client, { plant, codeClassCd, line, materialCode }) {
  return workCenterDao.findWorkCenters(client, { plant, codeClassCd, line, materialCode });
}

/**
 * Line 옵션 조회 (service)
 */
export async function getLines(client, { plant, workCenter, materialCode }) {
  return lineDao.findLines(client, { plant, workCenter, materialCode });
}

/**
 * Machine 옵션 조회 (service)
 */
export async function getMachines(client, { plant, workCenter, materialCode }) {
  return machineDao.findMachines(client, { plant, workCenter, materialCode });
}

/**
 * Material 옵션 조회 (remain > 0, service)
 * - styleCd, sizeCd 필터 옵션 추가
 */
export async function getMaterials(client, { plant, workCenter, line, styleCd, sizeCd }) {
  return dmpdProdOrderDao.findMaterialsWithRemain(client, { plant, workCenter, line, styleCd, sizeCd });
}

/**
 * Components 옵션/집계 조회 (service)
 * - DAO: dmpdProdOrderDao.findComponents 사용
 */
export async function getComponents(client, { plant, workCenter, line, materialCode, limit }) {
  return dmpdProdOrderDao.findComponents(client, { plant, workCenter, line, materialCode, limit });
}

/**
 * 스타일+사이즈 → material 단건/후보 조회
 */
export async function resolveMaterial(client, { plant, workCenter, line, styleCd, sizeCd }) {
  return dmpdProdOrderDao.resolveMaterialByStyleSize(client, { plant, workCenter, line, styleCd, sizeCd });
}

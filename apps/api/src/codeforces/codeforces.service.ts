import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface CfContest {
  id: number;
  name: string;
  type: string;
  phase: string;
  frozen: boolean;
  durationSeconds: number;
  preparedBy?: string;
  startTimeSeconds?: number;
}

export interface CfProblem {
  contestId: number;
  index: string;
  name: string;
  type: string;
  tags: string[];
}

export interface CfApiResponse<T> {
  status: string;
  comment?: string;
  result: T;
}

@Injectable()
export class CodeforcesService {
  private readonly apiKey: string;
  private readonly secret: string;
  private readonly groupCode: string;

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.config.get<string>('CODEFORCES_API_KEY', '');
    this.secret = this.config.get<string>('CODEFORCES_API_SECRET', '');
    this.groupCode = this.config.get<string>('CODEFORCES_GROUP_CODE', '');
  }

  getDocGroups(): {
    id: string;
    title: string;
    groupCode: string;
    websiteUrl: string;
  }[] {
    const luyenTap = this.config.get<string>(
      'CODEFORCES_GROUP_LUYEN_TAP',
      'QMLH5CiNY0',
    );
    const khaoSat = this.config.get<string>(
      'CODEFORCES_GROUP_KHAO_SAT',
      'thwM5mnACt',
    );
    const thucChien = this.config.get<string>(
      'CODEFORCES_GROUP_THUC_CHIEN',
      'iBXOT8i9ss',
    );
    const websiteLuyenTap = this.config.get<string>(
      'CODEFORCES_WEBSITE_LUYEN_TAP',
      'http://unicornsedu.contest.codeforces.com',
    );
    const websiteKhaoSat = this.config.get<string>(
      'CODEFORCES_WEBSITE_KHAO_SAT',
      'http://unicornseduexam.contest.codeforces.com',
    );
    const websiteThucChien = this.config.get<string>(
      'CODEFORCES_WEBSITE_THUC_CHIEN',
      'http://testunicorns.contest.codeforces.com',
    );
    return [
      {
        id: 'luyen-tap',
        title: 'Hướng dẫn giải bài luyện tập codeforces UniEdu',
        groupCode: luyenTap,
        websiteUrl: websiteLuyenTap.replace(/\/$/, ''),
      },
      {
        id: 'khao-sat',
        title: 'Hướng dẫn giải bài Khảo sát UniEdu Exam',
        groupCode: khaoSat,
        websiteUrl: websiteKhaoSat.replace(/\/$/, ''),
      },
      {
        id: 'thuc-chien',
        title:
          'Hướng dẫn giải bài đề thực chiến đề thi UniEdu - Học Tin cùng Chuyên tin',
        groupCode: thucChien,
        websiteUrl: websiteThucChien.replace(/\/$/, ''),
      },
    ];
  }

  private buildSignedUrl(
    method: string,
    params: Record<string, string | number | boolean>,
  ): string {
    if (!this.apiKey || !this.secret) {
      throw new Error(
        'CODEFORCES_API_KEY và CODEFORCES_API_SECRET phải được cấu hình.',
      );
    }

    const time = Math.floor(Date.now() / 1000);
    const rand = crypto.randomBytes(3).toString('hex');
    const allParams = { ...params, apiKey: this.apiKey, time };

    const paramStr = Object.keys(allParams)
      .sort()
      .map((k) => `${k}=${allParams[k]}`)
      .join('&');

    const hashInput = `${rand}/${method}?${paramStr}#${this.secret}`;
    const hash = crypto.createHash('sha512').update(hashInput).digest('hex');
    const apiSig = rand + hash;

    const query = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(allParams).map(([k, v]) => [k, String(v)]),
      ),
      apiSig,
    });

    return `https://codeforces.com/api/${method}?${query.toString()}`;
  }

  async getContests(groupCode?: string): Promise<CfContest[]> {
    const group =
      groupCode ||
      this.groupCode ||
      this.config.get<string>('CODEFORCES_GROUP_CODE', 'QMLH5CiNY0');
    const url = this.buildSignedUrl('contest.list', {
      groupCode: group,
    });

    const response =
      await this.httpService.axiosRef.get<CfApiResponse<CfContest[]>>(url);
    const json = response.data;

    if (json.status !== 'OK') {
      throw new Error(json.comment || 'Codeforces API failed');
    }

    return json.result;
  }

  async getContestProblems(contestId: number): Promise<CfProblem[]> {
    const url = this.buildSignedUrl('contest.standings', {
      contestId,
      from: 1,
      count: 1,
    });

    const response = await this.httpService.axiosRef.get<
      CfApiResponse<{
        contest: CfContest;
        problems: CfProblem[];
        rows: unknown[];
      }>
    >(url);
    const json = response.data;

    if (json.status !== 'OK') {
      throw new Error(json.comment || 'Codeforces API failed');
    }

    return json.result.problems || [];
  }
}
